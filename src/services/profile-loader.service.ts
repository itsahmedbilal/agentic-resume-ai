import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { MasterProfile, flattenBullets, BulletRecord } from '../models/profile.model';

@Injectable()
export class ProfileLoaderService implements OnModuleInit {
  private readonly logger = new Logger(ProfileLoaderService.name);
  private profile!: MasterProfile;

  async onModuleInit() {
    const filePath = path.join(process.cwd(), 'data', 'profile.json');
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    this.profile = JSON.parse(raw) as MasterProfile;
    this.logger.log(`Profile loaded: ${this.profile.name}`);
  }

  getProfile(): MasterProfile {
    return this.profile;
  }

  getBullets(): BulletRecord[] {
    return flattenBullets(this.profile);
  }
}
