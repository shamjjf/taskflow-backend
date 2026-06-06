import cron, { ScheduledTask } from 'node-cron';
import { env } from '@/config/env';
import { runWeeklyReportJob } from '@/modules/reports/weeklyReportJob';

let scheduled: ScheduledTask | null = null;

export function startWeeklyReportScheduler(): ScheduledTask | null {
  if (!env.WEEKLY_REPORT_ENABLED) {
    console.log('[WeeklyReport] Scheduler disabled via WEEKLY_REPORT_ENABLED=false');
    return null;
  }

  if (!cron.validate(env.WEEKLY_REPORT_CRON)) {
    console.error(`[WeeklyReport] Invalid WEEKLY_REPORT_CRON expression: "${env.WEEKLY_REPORT_CRON}"`);
    return null;
  }

  scheduled = cron.schedule(
    env.WEEKLY_REPORT_CRON,
    async () => {
      const startedAt = new Date();
      console.log(`[WeeklyReport] Job started at ${startedAt.toISOString()}`);
      try {
        // Per-org job: log a one-liner per organization so multi-tenant
        // runs are auditable without scanning the whole payload.
        const result = await runWeeklyReportJob();
        for (const org of result.perOrg) {
          if (org.skippedReason) {
            console.warn(
              `[WeeklyReport] org=${org.organizationSlug} skipped: ${org.skippedReason}`
            );
          } else {
            console.log(
              `[WeeklyReport] org=${org.organizationSlug} sent to ${org.recipients.length} ` +
                `recipient(s) — ${org.submittedCount}/${org.rowCount} employees submitted ` +
                `for ${org.weekStart} to ${org.weekEnd}. messageId=${org.messageId}`
            );
          }
        }
      } catch (err) {
        console.error('[WeeklyReport] Job failed:', err);
      }
    },
    {
      timezone: env.WEEKLY_REPORT_TIMEZONE,
    }
  );

  console.log(
    `[WeeklyReport] Scheduled "${env.WEEKLY_REPORT_CRON}" (${env.WEEKLY_REPORT_TIMEZONE})`
  );
  return scheduled;
}

export function stopWeeklyReportScheduler(): void {
  if (scheduled) {
    scheduled.stop();
    scheduled = null;
  }
}
