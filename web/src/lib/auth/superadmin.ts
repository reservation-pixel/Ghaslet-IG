import { createLogger } from "@/lib/logger";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/auth/password";
import {
  createUser,
  findSuperadmin,
  findUserByEmail,
  normalizeEmail,
  setPassword,
  setRole,
} from "@/database/userRepository";

const log = createLogger("auth.superadmin");

/* ===========================================================================
   HARDCODED SUPERADMIN
   ---------------------------------------------------------------------------
   These credentials live in source control. That means:

     - they are identical on every deployment,
     - anyone who can read this repository can sign in to the dashboard,
       which can read every Instagram DM and send messages as the business,
     - `git` keeps them forever, even after they are edited out.

   Change DEFAULT_PASSWORD below before exposing this app to a network, or —
   better — set SUPERADMIN_PASSWORD in .env.local, which overrides it without
   touching source. The server logs a warning on every login while the shipped
   default is still in use.
   ======================================================================== */

const DEFAULT_EMAIL = "admin@ghaslet.local";
const DEFAULT_NAME = "Super Admin";
const DEFAULT_PASSWORD = "ChangeMe-Ghaslet-Superadmin";

/**
 * Each constant can be overridden from `.env.local` without editing source.
 * Note that only `.env.local` and `.env` are ever read — `.env.example` is a
 * committed template and has no effect at runtime.
 */
function superadminEmail(): string {
  return process.env.SUPERADMIN_EMAIL?.trim() || DEFAULT_EMAIL;
}

function superadminName(): string {
  return process.env.SUPERADMIN_NAME?.trim() || DEFAULT_NAME;
}

function configuredPassword(): { password: string; isDefault: boolean } {
  const override = process.env.SUPERADMIN_PASSWORD?.trim();
  if (override) return { password: override, isDefault: false };
  return { password: DEFAULT_PASSWORD, isDefault: true };
}

export const HARDCODED_SUPERADMIN = {
  get email() {
    return superadminEmail();
  },
  get name() {
    return superadminName();
  },
};

export function isHardcodedSuperadmin(email: string): boolean {
  return normalizeEmail(email) === normalizeEmail(superadminEmail());
}

/**
 * Materialise the hardcoded superadmin as a real row, on demand.
 *
 * A purely in-memory user would not work: `auth_sessions.user_id` is a foreign
 * key to `app_users`, so refresh tokens — and therefore any session lasting
 * beyond the 15-minute access token — need a row to point at.
 *
 * Called from the login route when the submitted email matches, so there is no
 * seed step and no bootstrap hook. Idempotent and safe to call on every
 * attempt. Never throws: a provisioning failure must fail the login, not
 * 500 the endpoint.
 */
export async function ensureHardcodedSuperadmin(submittedPassword: string): Promise<void> {
  const { password, isDefault } = configuredPassword();
  const email = superadminEmail();

  if (isDefault) {
    log.warn("hardcoded superadmin is using the password shipped in source", {
      event: "superadmin_default_password",
      email,
      hint: "set SUPERADMIN_PASSWORD in .env.local",
    });
  }

  // Warn but do not block: locking the operator out of their own dashboard
  // over a weak password would be worse than letting them in with one.
  const weakness = validatePasswordStrength(password);
  if (weakness) {
    log.warn("superadmin password is weak", {
      event: "superadmin_weak_password",
      email,
      reason: weakness,
    });
  }

  try {
    const existing = await findUserByEmail(email);

    if (existing) {
      if (existing.role !== "superadmin") {
        await setRole(existing.id, "superadmin").catch((err) => {
          log.error("could not promote the hardcoded account to superadmin", {
            error: err,
            hint: "another account already holds the superadmin role",
          });
        });
      }

      // Re-sync from source ONLY when the caller presented exactly the
      // configured password and the stored hash disagrees — i.e. the constant
      // or the env override was changed since the row was written.
      //
      // Narrow on purpose. Re-hashing on every attempt would write to the
      // database on each wrong guess, and would silently undo a deliberate
      // `seed:superadmin --rotate`.
      if (submittedPassword !== password) return;
      if (await verifyPassword(password, existing.password_hash)) return;

      await setPassword(existing.id, await hashPassword(password));
      log.warn("re-synced the superadmin password from configuration", {
        event: "superadmin_password_resynced",
        email,
      });
      return;
    }

    // Only one superadmin may exist. If a different account already holds the
    // role, provisioning would violate the unique index — so back off and say
    // so rather than letting the insert fail opaquely.
    const incumbent = await findSuperadmin();
    if (incumbent) {
      log.error("a different superadmin already exists — not provisioning", {
        event: "superadmin_conflict",
        incumbent: incumbent.email,
        configured: email,
        hint: "change SUPERADMIN_EMAIL back, delete the other row, or sign in as it",
      });
      return;
    }

    await createUser({
      email,
      passwordHash: await hashPassword(password),
      name: superadminName(),
      role: "superadmin",
    });

    log.warn("provisioned the superadmin", {
      event: "superadmin_provisioned",
      email,
    });
  } catch (err) {
    log.error("failed to provision the hardcoded superadmin", { error: err });
  }
}
