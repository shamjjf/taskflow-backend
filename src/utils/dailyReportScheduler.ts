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
        // Per-org job: log a one-liner per organization so multi-tenant
        // runs are auditable without scanning the whole payload.
        const result = await runDailyReportJob();
        for (const org of result.perOrg) {
          if (org.skippedReason) {
            console.warn(
              `[DailyReport] org=${org.organizationSlug} skipped: ${org.skippedReason}`
            );
          } else {
            console.log(
              `[DailyReport] org=${org.organizationSlug} sent to ${org.recipients.length} ` +
                `recipient(s) — ${org.submittedCount}/${org.rowCount} employees submitted. ` +
                `messageId=${org.messageId}`
            );
          }
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
