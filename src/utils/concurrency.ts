export function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  return new Promise(resolve => {
    const results: PromiseSettledResult<T>[] = new Array(tasks.length);
    let started = 0;
    let finished = 0;

    const next = () => {
      if (started === tasks.length) return;
      const idx = started++;
      tasks[idx]()
        .then(value  => { results[idx] = { status: 'fulfilled', value }; })
        .catch(reason => { results[idx] = { status: 'rejected', reason }; })
        .finally(() => {
          finished++;
          if (finished === tasks.length) resolve(results);
          else next();
        });
    };

    for (let i = 0; i < Math.min(limit, tasks.length); i++) next();
  });
}
