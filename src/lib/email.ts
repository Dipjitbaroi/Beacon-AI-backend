import nodemailer, { type Transporter } from "nodemailer";

import config from "../config";

let transporter: Transporter | null = null;

function getTransporter() {
  if (!config.smtp_host || !config.smtp_user || !config.smtp_pass || !config.smtp_from) {
    return null;
  }

  transporter ??= nodemailer.createTransport({
    host: config.smtp_host,
    port: config.smtp_port,
    secure: config.smtp_secure,
    auth: {
      user: config.smtp_user,
      pass: config.smtp_pass,
    },
  });
  return transporter;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function isEmailAddress(value: string | null | undefined): value is string {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

export async function sendReportCreatedEmail(input: {
  to: string;
  citizenName?: string | null;
  reportId: string;
  trackingCode: string;
  summary?: string | null;
}) {
  const mailer = getTransporter();
  if (!mailer) return false;

  const recipient = input.citizenName?.trim() || "Citizen";
  const trackingUrl = config.app_url
    ? `${config.app_url.replace(/\/$/, "")}/track?code=${encodeURIComponent(input.trackingCode)}`
    : null;

  try {
    await mailer.sendMail({
      from: config.smtp_from,
      to: input.to.trim(),
      subject: `Beacon report received — ${input.trackingCode}`,
      text: [
        `Hello ${recipient},`,
        "",
        "Your civic infrastructure report has been received.",
        `Report ID: ${input.reportId}`,
        `Public tracking code: ${input.trackingCode}`,
        input.summary ? `Summary: ${input.summary}` : null,
        trackingUrl ? `Track your report: ${trackingUrl}` : null,
        "",
        "Keep the tracking code safe. You can use it to follow public progress updates.",
        "",
        "Beacon",
      ].filter(Boolean).join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#0f172a">
          <p>Hello ${escapeHtml(recipient)},</p>
          <h1 style="font-size:22px">Your report has been received</h1>
          <p>Beacon has added your civic infrastructure report to the review queue.</p>
          <div style="background:#f1f5f9;border-radius:12px;padding:18px;margin:20px 0">
            <p style="margin:0 0 10px;color:#475569;font-size:12px">REPORT ID</p>
            <p style="margin:0 0 18px;font-family:monospace;word-break:break-all">${escapeHtml(input.reportId)}</p>
            <p style="margin:0 0 10px;color:#475569;font-size:12px">PUBLIC TRACKING CODE</p>
            <p style="margin:0;font-family:monospace;font-size:20px;font-weight:bold">${escapeHtml(input.trackingCode)}</p>
          </div>
          ${input.summary ? `<p><strong>Summary:</strong> ${escapeHtml(input.summary)}</p>` : ""}
          ${trackingUrl ? `<p><a href="${escapeHtml(trackingUrl)}" style="display:inline-block;background:#0f766e;color:white;text-decoration:none;padding:11px 16px;border-radius:8px">Track this report</a></p>` : ""}
          <p style="color:#64748b;font-size:13px">Keep the tracking code safe to follow public progress updates.</p>
        </div>
      `,
    });
    return true;
  } catch (error) {
    console.error("[email] report confirmation failed:", (error as Error).message);
    return false;
  }
}
