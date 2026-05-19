import cron, { ScheduledTask } from 'node-cron';
import { env } from '@/config/env';
import { runDailyReportJob } from '@/modules/reports/dailyReportJob';

let scheduled: ScheduledTask | null = null;

export function startDailyReportScheduler(): ScheduledTask | null {
  if (!env.DAILY_REPORT_ENABLED) {
    console.log('[DailyReport] Scheduler disabled via DAILY_REPORT_ENABLED=false');
    return null;
  }

  if (!cron.validate(env.DAILY_REPORT_CRON)) {
    console.error(`[DailyReport] Invalid DAILY_REPORT_CRON expression: "${env.DAILY_REPORT_CRON}"`);
    return null;
  }

  scheduled = cron.schedule(
    env.DAILY_REPORT_CRON,
    async () => {
      const startedAt = new Date();
      console.log(`[DailyReport] Job started at ${startedAt.toISOString()}`);
      try {
        const result = await runDailyReportJob();
        if (result.skippedReason) {
          console.warn(`[DailyReport] Skipped: ${result.skippedReason}`);
        } else {
          console.log(
            `[DailyReport] Sent to ${result.recipients.length} recipient(s) — ` +
              `${result.submittedCount}/${result.rowCount} employees submitted. ` +
              `messageId=${result.messageId}`
          );
        }
      } catch (err) {
        console.error('[DailyReport] Job failed:', err);
      }
    },
    {
      timezone: env.DAILY_REPORT_TIMEZONE,
    }
  );

  console.log(
    `[DailyReport] Scheduled "${env.DAILY_REPORT_CRON}" (${env.DAILY_REPORT_TIMEZONE})`
  );
  return scheduled;
}

export function stopDailyReportScheduler(): void {
  if (scheduled) {
    scheduled.stop();
    scheduled = null;
  }
}
