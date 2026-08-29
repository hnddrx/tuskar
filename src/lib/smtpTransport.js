// Server-only: the half of the SMTP support that actually touches the
// network. Kept apart from smtp.js so that the presets, validation and error
// wording stay testable without nodemailer.

import nodemailer from "nodemailer";
import { buildTransportOptions, describeSmtpError, formatSender } from "@/lib/smtp";

function transportFor(config) {
  return nodemailer.createTransport({
    ...buildTransportOptions(config),
    // A settings screen should fail in seconds, not hang until the browser
    // gives up.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

/** Opens a connection and authenticates, without sending anything. */
export async function testSmtpConnection(config) {
  try {
    await transportFor(config).verify();
    return { ok: true, message: `Connected to ${config.host} as ${config.username || "anonymous"}.` };
  } catch (error) {
    return { ok: false, error: describeSmtpError(error, config) };
  }
}

/**
 * Sends one message. `message` is the nodemailer shape (to/subject/text/html/
 * attachments); the From header always comes from the saved configuration,
 * never from the caller, so a message cannot claim to be from someone else.
 */
export async function sendViaSmtp(config, message) {
  try {
    const info = await transportFor(config).sendMail({
      ...message,
      from: formatSender(config),
    });
    return { ok: true, id: info.messageId, accepted: info.accepted?.length || 0 };
  } catch (error) {
    return { ok: false, error: describeSmtpError(error, config) };
  }
}
