import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import * as puppeteer from 'puppeteer';
import pdfParse from 'pdf-parse';
import { MasterProfile, flatSkills } from '../models/profile.model';

@Injectable()
export class PdfGeneratorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PdfGeneratorService.name);
  private browser!: puppeteer.Browser;
  private template!: Handlebars.TemplateDelegate;

  async onModuleInit() {
    const templatePath = path.join(process.cwd(), 'templates', 'resume.hbs');
    const source = await fs.promises.readFile(templatePath, 'utf-8');
    this.template = Handlebars.compile(source);

    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    this.logger.log('Puppeteer browser launched');
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async generatePdf(
    filteredProfile: MasterProfile,
    rewrittenMap: Map<string, string>,
    outputPath: string,
    tailoredSummary: string,
    requiredSkills: string[],
  ): Promise<void> {
    const experience = filteredProfile.experience.map(exp => ({
      company: exp.company,
      title: exp.title,
      duration: exp.duration,
      achievements: exp.achievements.map(a => rewrittenMap.get(a) ?? a),
    }));

    const projects = filteredProfile.projects.map(proj => ({
      name: proj.name,
      description: proj.description,
      techStack: proj.techStack,
      achievements: proj.achievements.map(a => rewrittenMap.get(a) ?? a),
    }));

    const skillsList = flatSkills(filteredProfile).join(', ');

    const context = {
      name: filteredProfile.name,
      title: filteredProfile.title,
      summary: tailoredSummary,
      contact: filteredProfile.contact,
      skillsList,
      experience,
      projects,
      education: filteredProfile.education,
      certifications: filteredProfile.certifications,
      requiredSkills,
    };

    const html = this.template(context);

    const dir = path.dirname(outputPath);
    await fs.promises.mkdir(dir, { recursive: true });

    const page = await this.browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outputPath,
      format: 'Letter',
      printBackground: false,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
    });
    await page.close();

    const buffer = await fs.promises.readFile(outputPath);
    const data = await pdfParse(buffer);
    if (data.text.trim().length < 500) {
      throw new Error('ATS compliance check failed: insufficient extractable text');
    }
    this.logger.log(`PDF generated: ${outputPath}`);
  }
}
