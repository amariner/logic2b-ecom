import { describe, expect, it } from 'vitest';
import {
  CustomerAuthRateLimitConflictError,
  createD1CustomerAuthRateLimitRepository,
} from '../src/modules/customers';
import { SqliteD1 } from './sqlite-d1';

const START = Date.parse('2026-08-19T09:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (offset: number): string => new Date(START + offset).toISOString();
const CONTACT = 'a'.repeat(64);
const CHALLENGE = 'b'.repeat(64);

describe('rate limit durable de passwordless', () => {
  it('serializa carreras y limita el cuarto inicio por contacto en 15 minutos', async () => {
    const db = new SqliteD1();
    const repository = createD1CustomerAuthRateLimitRepository(db.asD1());
    const outcomes = await Promise.all(Array.from({ length: 4 }, (_, index) =>
      repository.recordContactStart({
        contactIdentityHash: CONTACT,
        occurredAt: iso(0),
        expiresAt: iso(DAY_MS),
        idempotencyKey: `auth:rate:contact:race:${index + 1}`,
      })));

    expect(outcomes.map(({ count15m }) => count15m).sort((a, b) => a - b))
      .toEqual([1, 2, 3, 4]);
    expect(outcomes.filter(({ limited }) => limited)).toHaveLength(1);
    expect(db.value(`SELECT count(*) AS value FROM customer_auth_throttle_events
      WHERE scope='contact_start'`)).toBe(4);
  });

  it('aplica también 10/24h aunque cada inicio quede fuera de la ventana corta', async () => {
    const db = new SqliteD1();
    const repository = createD1CustomerAuthRateLimitRepository(db.asD1());
    const decisions = [];
    for (let index = 0; index < 11; index += 1) {
      const offset = index * 16 * 60 * 1000;
      decisions.push(await repository.recordContactStart({
        contactIdentityHash: CONTACT,
        occurredAt: iso(offset),
        expiresAt: iso(offset + DAY_MS),
        idempotencyKey: `auth:rate:contact:daily:${index + 1}`,
      }));
    }

    expect(decisions.slice(0, 10).every(({ limited }) => !limited)).toBe(true);
    expect(decisions[10]).toMatchObject({
      outcome: 'limited', limited: true, count15m: 1, count24h: 11,
    });
  });

  it('congela el replay exacto y rechaza reutilizar su clave con otro sujeto', async () => {
    const db = new SqliteD1();
    const repository = createD1CustomerAuthRateLimitRepository(db.asD1());
    const command = {
      contactIdentityHash: CONTACT,
      occurredAt: iso(0),
      expiresAt: iso(DAY_MS),
      idempotencyKey: 'auth:rate:contact:replay:1',
    } as const;

    expect(await repository.recordContactStart(command)).toMatchObject({
      outcome: 'accepted', limited: false, count15m: 1, count24h: 1,
    });
    expect(await repository.recordContactStart(command)).toMatchObject({
      outcome: 'replayed', limited: false, count15m: 1, count24h: 1,
    });
    await expect(repository.recordContactStart({
      ...command, contactIdentityHash: 'c'.repeat(64),
    })).rejects.toBeInstanceOf(CustomerAuthRateLimitConflictError);
  });

  it('limita y hace reproducible el quinto fallo por digest de challenge', async () => {
    const db = new SqliteD1();
    const repository = createD1CustomerAuthRateLimitRepository(db.asD1());
    expect(await repository.challengeFailureState({
      challengeDigest: CHALLENGE,
      at: iso(0),
    })).toEqual({ limited: false, failures: 0 });
    const outcomes = await Promise.all(Array.from({ length: 5 }, (_, index) =>
      repository.recordChallengeFailure({
        challengeDigest: CHALLENGE,
        occurredAt: iso(index),
        expiresAt: iso(10 * 60 * 1000),
        idempotencyKey: `auth:rate:challenge:failure:${index + 1}`,
      })));

    expect(outcomes.map(({ failures }) => failures).sort((a, b) => a - b))
      .toEqual([1, 2, 3, 4, 5]);
    expect(outcomes.filter(({ limited }) => limited)).toHaveLength(1);
    const fifth = {
      challengeDigest: CHALLENGE,
      occurredAt: iso(4),
      expiresAt: iso(10 * 60 * 1000),
      idempotencyKey: 'auth:rate:challenge:failure:5',
    } as const;
    expect(await repository.recordChallengeFailure(fifth)).toMatchObject({
      outcome: 'replayed', limited: true, failures: 5,
    });
    expect(await repository.challengeFailureState({
      challengeDigest: CHALLENGE,
      at: iso(5),
    })).toEqual({ limited: true, failures: 5 });
    expect(await repository.challengeFailureState({
      challengeDigest: CHALLENGE,
      at: iso(10 * 60 * 1000),
    })).toEqual({ limited: false, failures: 0 });
  });

  it('purga solo decisiones vencidas y nunca persiste el challenge o contacto crudo', async () => {
    const db = new SqliteD1();
    const repository = createD1CustomerAuthRateLimitRepository(db.asD1());
    await repository.recordContactStart({
      contactIdentityHash: CONTACT,
      occurredAt: iso(0),
      expiresAt: iso(DAY_MS),
      idempotencyKey: 'auth:rate:contact:purge:1',
    });
    await repository.recordChallengeFailure({
      challengeDigest: CHALLENGE,
      occurredAt: iso(0),
      expiresAt: iso(10 * 60 * 1000),
      idempotencyKey: 'auth:rate:challenge:purge:1',
    });

    expect(await repository.purgeExpired(iso(10 * 60 * 1000))).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM customer_auth_throttle_events')).toBe(1);
    const serialized = JSON.stringify(db.query('SELECT * FROM customer_auth_throttle_events'));
    expect(serialized).not.toContain('private@example.com');
    expect(serialized).not.toContain('auth_challenge:');
  });

  it('elimina físicamente decisiones de más de 24 horas al registrar actividad nueva', async () => {
    const db = new SqliteD1();
    const repository = createD1CustomerAuthRateLimitRepository(db.asD1());
    await repository.recordContactStart({
      contactIdentityHash: CONTACT,
      occurredAt: iso(0),
      expiresAt: iso(DAY_MS),
      idempotencyKey: 'auth:rate:contact:retention:old',
    });

    await repository.recordContactStart({
      contactIdentityHash: 'd'.repeat(64),
      occurredAt: iso(DAY_MS + 1),
      expiresAt: iso(2 * DAY_MS + 1),
      idempotencyKey: 'auth:rate:contact:retention:new',
    });

    expect(db.query(`SELECT idempotency_key FROM customer_auth_throttle_events
      ORDER BY idempotency_key`)).toEqual([{
      idempotency_key: 'auth:rate:contact:retention:new',
    }]);
  });

  it('rechaza TTLs no canónicos o superiores a 24 horas sin escribir', async () => {
    const db = new SqliteD1();
    const repository = createD1CustomerAuthRateLimitRepository(db.asD1());
    await expect(repository.recordContactStart({
      contactIdentityHash: CONTACT,
      occurredAt: iso(0),
      expiresAt: iso(DAY_MS - 1),
      idempotencyKey: 'auth:rate:contact:short-ttl',
    })).rejects.toBeInstanceOf(CustomerAuthRateLimitConflictError);
    await expect(repository.recordChallengeFailure({
      challengeDigest: CHALLENGE,
      occurredAt: iso(0),
      expiresAt: iso(DAY_MS + 1),
      idempotencyKey: 'auth:rate:challenge:long-ttl',
    })).rejects.toBeInstanceOf(CustomerAuthRateLimitConflictError);
    expect(db.value('SELECT count(*) AS value FROM customer_auth_throttle_events')).toBe(0);
  });
});
