import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';
import type { Plugin, DataSourcePlugin } from './types.js';

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  register(plugin: Plugin): void {
    this.plugins.set(plugin.metadata.id, plugin);
    console.log(`Plugin registered: ${plugin.metadata.name} v${plugin.metadata.version}`);
  }

  unregister(pluginId: string): void {
    this.stopSchedule(pluginId);
    this.plugins.delete(pluginId);
  }

  get(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId);
  }

  listAll(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  async scheduleDataSource(pluginId: string, cronExpression: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || plugin.metadata.type !== 'data-source') {
      throw new Error(`Plugin ${pluginId} is not a data-source plugin`);
    }

    this.stopSchedule(pluginId);

    const job = cron.schedule(cronExpression, async () => {
      console.log(`Running scheduled fetch for plugin: ${pluginId}`);
      try {
        const result = await (plugin as DataSourcePlugin).fetch();
        await this.prisma.dataSourceLog.create({
          data: {
            source: result.source,
            status: 'success',
            message: `Fetched ${result.recordsAffected} records`,
            recordsAffected: result.recordsAffected,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        await this.prisma.dataSourceLog.create({
          data: {
            source: pluginId,
            status: 'error',
            message,
          },
        });
        console.error(`Plugin ${pluginId} fetch failed:`, message);
      }
    });

    this.scheduledJobs.set(pluginId, job);
    console.log(`Scheduled plugin ${pluginId}: ${cronExpression}`);
  }

  stopSchedule(pluginId: string): void {
    const job = this.scheduledJobs.get(pluginId);
    if (job) {
      job.stop();
      this.scheduledJobs.delete(pluginId);
    }
  }

  async runDataSource(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || plugin.metadata.type !== 'data-source') {
      throw new Error(`Plugin ${pluginId} is not a data-source plugin`);
    }

    const result = await (plugin as DataSourcePlugin).fetch();
    await this.prisma.dataSourceLog.create({
      data: {
        source: result.source,
        status: 'success',
        message: `Manual run: ${result.recordsAffected} records`,
        recordsAffected: result.recordsAffected,
      },
    });
  }

  stopAll(): void {
    for (const [id] of this.scheduledJobs) {
      this.stopSchedule(id);
    }
  }
}
