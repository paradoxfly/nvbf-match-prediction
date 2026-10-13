import { Inject, Injectable } from '@nestjs/common';
import type { Category, CreateTeamInput, TeamView, UpdateTeamInput } from '@predict/contracts';
import { and, asc, eq, isNull, mediaAssets, teams, type Database } from '@predict/db';
import { AuditService, type Actor } from '../common/audit.service';
import { DomainError } from '../common/domain-error';
import { isUniqueViolation } from '../common/pg-errors';
import { DB } from '../database/database.module';
import { MediaService } from '../media/media.service';

@Injectable()
export class TeamsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  async list(category?: Category, includeArchived = false): Promise<TeamView[]> {
    const rows = await this.db
      .select({
        team: teams,
        logoKey: mediaAssets.storageKey,
        logoStatus: mediaAssets.status,
      })
      .from(teams)
      .leftJoin(mediaAssets, eq(mediaAssets.id, teams.logoMediaId))
      .where(
        and(
          category ? eq(teams.category, category) : undefined,
          includeArchived ? undefined : isNull(teams.archivedAt),
        ),
      )
      .orderBy(asc(teams.category), asc(teams.name));
    return rows.map((row) => this.view(row.team, row.logoKey, row.logoStatus));
  }

  async create(actor: Actor, input: CreateTeamInput): Promise<TeamView> {
    try {
      const id = await this.db.transaction(async (tx) => {
        if (input.logoMediaId) await this.media.requireReady(tx, input.logoMediaId, ['team_logo']);
        const [team] = await tx
          .insert(teams)
          .values({
            name: input.name,
            shortName: input.shortName.toUpperCase(),
            category: input.category,
            logoMediaId: input.logoMediaId ?? null,
          })
          .returning();
        await this.audit.record(tx, actor, {
          action: 'team.created',
          targetType: 'team',
          targetId: team!.id,
          after: { name: team!.name, shortName: team!.shortName, category: team!.category },
        });
        return team!.id;
      });
      return this.get(id);
    } catch (error) {
      if (isUniqueViolation(error)) throw new DomainError('TEAM_EXISTS');
      throw error;
    }
  }

  async update(actor: Actor, input: UpdateTeamInput): Promise<TeamView> {
    try {
      await this.db.transaction(async (tx) => {
        const [before] = await tx.select().from(teams).where(eq(teams.id, input.id)).for('update');
        if (!before) throw new DomainError('NOT_FOUND');
        if (input.logoMediaId) await this.media.requireReady(tx, input.logoMediaId, ['team_logo']);
        const [after] = await tx
          .update(teams)
          .set({
            name: input.name,
            shortName: input.shortName?.toUpperCase(),
            logoMediaId: input.logoMediaId,
            archivedAt:
              input.archived === undefined
                ? undefined
                : input.archived
                  ? (before.archivedAt ?? new Date())
                  : null,
          })
          .where(eq(teams.id, input.id))
          .returning();
        await this.audit.record(tx, actor, {
          action: 'team.updated',
          targetType: 'team',
          targetId: input.id,
          before: {
            name: before.name,
            shortName: before.shortName,
            logoMediaId: before.logoMediaId,
            archivedAt: before.archivedAt,
          },
          after: {
            name: after!.name,
            shortName: after!.shortName,
            logoMediaId: after!.logoMediaId,
            archivedAt: after!.archivedAt,
          },
        });
      });
      return this.get(input.id);
    } catch (error) {
      if (isUniqueViolation(error)) throw new DomainError('TEAM_EXISTS');
      throw error;
    }
  }

  private async get(id: string): Promise<TeamView> {
    const [row] = await this.db
      .select({ team: teams, logoKey: mediaAssets.storageKey, logoStatus: mediaAssets.status })
      .from(teams)
      .leftJoin(mediaAssets, eq(mediaAssets.id, teams.logoMediaId))
      .where(eq(teams.id, id));
    if (!row) throw new DomainError('NOT_FOUND');
    return this.view(row.team, row.logoKey, row.logoStatus);
  }

  private view(
    team: typeof teams.$inferSelect,
    logoKey: string | null,
    logoStatus: string | null,
  ): TeamView {
    return {
      id: team.id,
      name: team.name,
      shortName: team.shortName,
      category: team.category,
      logoUrl: this.media.urlFromKey(logoKey, logoStatus),
      archived: team.archivedAt !== null,
    };
  }
}
