import nodemailer from "nodemailer";
import cron from "node-cron";
import { config } from "../config.js";
import { database } from "../database.js";

function mailTransport() {
  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASSWORD || !config.SMTP_FROM) {
    throw new Error("Email delivery is not configured.");
  }
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
  });
}

export async function sendEmailVerification(email: string, token: string): Promise<void> {
  const transporter = mailTransport();
  await transporter.sendMail({
    from: config.SMTP_FROM,
    to: email,
    subject: "Verify your Careergrill email address",
    text: `Confirm your email address by opening this link within 24 hours: ${config.FRONTEND_URL}/verify-email?token=${encodeURIComponent(token)}\n\nIf you did not create a Careergrill account, you can ignore this email.`,
  });
}

export function startExpiryReminders(): void {
  const mailSettings = [config.SMTP_HOST, config.SMTP_USER, config.SMTP_PASSWORD, config.SMTP_FROM];
  if (!mailSettings.every(Boolean)) {
    console.warn("Expiry reminders are disabled until SMTP_HOST, SMTP_USER, SMTP_PASSWORD and SMTP_FROM are configured.");
    return;
  }

  const transporter = mailTransport();

  cron.schedule("0 9 * * *", () => {
    void sendExpiryReminders(transporter).catch((error: unknown) => {
      console.error("Could not process saved-content expiry reminders:", error instanceof Error ? error.message : "Unknown reminder processing error.");
    });
  }, { timezone: "UTC" });
}

async function sendExpiryReminders(transporter: ReturnType<typeof nodemailer.createTransport>): Promise<void> {
    const now = new Date();
    const result = await database().rpc("claim_expiry_reminders");
    const { data, error } = result;
    if (error) {
      console.error("Could not load upcoming saved-content reminders:", error.message);
      return;
    }

    for (const row of data ?? []) {
      if (!row.email || !row.title || !row.slug || !row.expires_at) {
        console.error("Skipped an incomplete saved-content reminder claim.");
        continue;
      }
      try {
        await transporter.sendMail({
          from: config.SMTP_FROM,
          to: row.email,
          subject: `A saved Careergrill listing is expiring soon`,
          text: `"${row.title}" is scheduled to expire on ${new Date(row.expires_at).toLocaleDateString("en", { dateStyle: "long" })}. Recheck the official source before applying: ${config.FRONTEND_URL}/content/${row.slug}`,
        });
        const { error: updateError } = await database()
          .from("saved_content")
          .update({ reminded_at: now.toISOString(), reminder_claimed_at: null })
          .eq("id", row.saved_id);
        if (updateError) console.error("Could not record sent reminder:", updateError.message);
      } catch (error) {
        try {
          const { error: releaseError } = await database()
            .from("saved_content")
            .update({ reminder_claimed_at: null })
            .eq("id", row.saved_id);
          if (releaseError) console.error("Could not release a failed reminder claim:", releaseError.message);
        } catch (releaseError) {
          console.error("Could not release a failed reminder claim:", releaseError instanceof Error ? releaseError.message : "Unknown database error.");
        }
        console.error("Could not send saved-content expiry reminder:", error instanceof Error ? error.message : "Unknown email delivery error.");
      }
    }
}
