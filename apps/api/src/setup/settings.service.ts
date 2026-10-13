import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_DAY_CONFIG, type SettingsView } from '@predict/contracts';
import { eq, settings, type Database, type Executor } from '@predict/db';
import { AuditService, type Actor } from '../common/audit.service';
import { DB } from '../database/database.module';

export type SettingsRow = typeof settings.$inferSelect;

@Injectable()
export class SettingsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** The single settings row, created with defaults if missing. */
  async row(executor: Executor = this.db): Promise<SettingsRow> {
    const [row] = await executor.select().from(settings).where(eq(settings.id, 1));
    if (row) return row;
    const [created] = await executor
      .insert(settings)
      .values({ id: 1, defaultDayConfig: DEFAULT_DAY_CONFIG })
      .onConflictDoNothing()
      .returning();
    return created ?? (await executor.select().from(settings).where(eq(settings.id, 1)))[0]!;
  }

  async get(): Promise<SettingsView> {
    return this.view(await this.row());
  }

  async update(
    actor: Actor,
    patch: Partial<Omit<SettingsView, 'collectionAccount'>> & {
      collectionAccount?: SettingsView['collectionAccount'];
    },
  ): Promise<SettingsView> {
    const updated = await this.db.transaction(async (tx) => {
      const before = await this.row(tx);
      const [after] = await tx
        .update(settings)
        .set({
          collectionAccount: patch.collectionAccount,
          defaultDayConfig: patch.defaultDayConfig,
          smsOnPaymentConfirmed: patch.smsOnPaymentConfirmed,
          supportContact: patch.supportContact,
          updatedByAdminId: actor.type === 'admin' ? actor.id : undefined,
        })
        .where(eq(settings.id, 1))
        .returning();
      const accountChanged =
        patch.collectionAccount !== undefined &&
        JSON.stringify(patch.collectionAccount) !== JSON.stringify(before.collectionAccount);
      await this.audit.record(tx, actor, {
        // The collection account is where players send money: its changes stand out in the log.
        action: accountChanged ? 'settings.collection_account_changed' : 'settings.updated',
        targetType: 'settings',
        targetId: '1',
        before: this.view(before) as unknown as Record<string, unknown>,
        after: this.view(after!) as unknown as Record<string, unknown>,
      });
      return after!;
    });
    return this.view(updated);
  }

  private view(row: SettingsRow): SettingsView {
    return {
      collectionAccount: row.collectionAccount ?? null,
      defaultDayConfig: row.defaultDayConfig,
      smsOnPaymentConfirmed: row.smsOnPaymentConfirmed,
      supportContact: row.supportContact,
    };
  }
}
