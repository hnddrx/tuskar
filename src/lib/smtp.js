// Outgoing mail server settings — the pure half.
//
// Everything here is free of nodemailer and of the network, so the presets,
// validation, transport shaping and error wording can be tested directly.
// The sending itself lives in smtpTransport.js, which is server-only.

export const SECURITY_MODES = ["none", "starttls", "ssl"];

// Common providers, so configuring Gmail is picking a name rather than
// knowing a port number. `custom` is the escape hatch for anything else.
export const SMTP_PRESETS = [
  {
    key: "gmail",
    label: "Gmail / Google Workspace",
    host: "smtp.gmail.com",
    port: 587,
    security: "starttls",
    hint: "Google requires an App Password here, not your normal account password. Create one at myaccount.google.com/apppasswords (needs 2-Step Verification switched on).",
  },
  {
    key: "outlook",
    label: "Outlook / Microsoft 365",
    host: "smtp-mail.outlook.com",
    port: 587,
    security: "starttls",
    hint: "Use an app password if your account has multi-factor authentication enabled.",
  },
  {
    key: "yahoo",
    label: "Yahoo Mail",
    host: "smtp.mail.yahoo.com",
    port: 587,
    security: "starttls",
    hint: "Yahoo requires an app password generated from your account security settings.",
  },
  {
    key: "zoho",
    label: "Zoho Mail",
    host: "smtp.zoho.com",
    port: 587,
    security: "starttls",
    hint: "",
  },
  {
    key: "resend",
    label: "Resend (SMTP)",
    host: "smtp.resend.com",
    port: 587,
    security: "starttls",
    hint: "Username is 'resend'; the password is your Resend API key.",
  },
  {
    key: "custom",
    label: "Other / custom server",
    host: "",
    port: 587,
    security: "starttls",
    hint: "",
  },
];

export function presetByKey(key) {
  return SMTP_PRESETS.find((p) => p.key === key) || null;
}

/**
 * nodemailer transport options for a stored configuration.
 *
 * `secure` means implicit TLS from the first byte (port 465). STARTTLS
 * instead opens in the clear and upgrades, so it sets requireTLS to make the
 * upgrade mandatory rather than best-effort — without it a server that fails
 * to offer STARTTLS would silently send credentials unencrypted.
 */
export function buildTransportOptions(config) {
  const options = {
    host: (config.host || "").trim(),
    port: Number(config.port) || 587,
    secure: config.security === "ssl",
  };
  if (config.security === "starttls") options.requireTLS = true;
  if (config.username) {
    options.auth = { user: config.username, pass: config.password };
  }
  return options;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param options.hasStoredPassword  true when a password is already saved, so
 *   the form may be submitted with the password field left blank.
 */
export function validateSmtpConfig(config, options = {}) {
  const errors = [];

  if (!String(config.host || "").trim()) {
    errors.push("SMTP server is required.");
  }

  const port = Number(config.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push("Port must be a number between 1 and 65535.");
  }

  if (!SECURITY_MODES.includes(config.security)) {
    errors.push("Security must be None, STARTTLS or SSL/TLS.");
  }

  const fromEmail = String(config.fromEmail || "").trim();
  if (!fromEmail || !EMAIL_SHAPE.test(fromEmail)) {
    errors.push("From address must be a valid email address.");
  }

  if (config.username && !config.password && !options.hasStoredPassword) {
    errors.push("Password is required when a username is set.");
  }

  return errors;
}

/** The From header: `Name <address>`, with any quotes in the name stripped. */
export function formatSender(config) {
  const email = String(config.fromEmail || "").trim();
  const name = String(config.fromName || "").replace(/"/g, "").trim();
  return name ? `${name} <${email}>` : email;
}

/**
 * Turns a nodemailer/SMTP failure into something a person can act on. The
 * raw errors are things like `EAUTH` with a bare "535" response, which tells
 * a user nothing about what to change.
 */
export function describeSmtpError(error, config = {}) {
  if (!error) return "The mail server rejected the connection.";

  const code = error.code || "";
  const host = String(config.host || "").toLowerCase();

  if (code === "EAUTH") {
    if (host.includes("gmail") || host.includes("google")) {
      return "The mail server rejected that username or password. Gmail needs an App Password here, not your normal Google password — create one at myaccount.google.com/apppasswords.";
    }
    return "The mail server rejected that username or password.";
  }
  if (code === "ECONNREFUSED") {
    return "Could not connect — the server refused the connection. Check the server address and port.";
  }
  if (code === "ETIMEDOUT" || code === "ECONNECTION") {
    return "The connection timed out. Check the server address and port, and that outgoing SMTP isn't blocked.";
  }
  if (code === "EDNS" || code === "ENOTFOUND") {
    return "That server address could not be found. Check it for typos.";
  }
  if (code === "ESOCKET") {
    // nodemailer reports both a TLS mismatch and a refused connection as
    // ESOCKET, so the underlying failure has to be read from the message —
    // otherwise "nothing is listening on that port" gets blamed on TLS.
    const detail = String(error.message || "");
    if (/ECONNREFUSED/i.test(detail)) {
      return "Could not connect — the server refused the connection. Check the server address and port.";
    }
    if (/ENOTFOUND|EAI_AGAIN/i.test(detail)) {
      return "That server address could not be found. Check it for typos.";
    }
    return "The secure connection failed. Check the Security setting — SSL/TLS is usually port 465, STARTTLS port 587.";
  }

  return error.message || "The mail server rejected the connection.";
}
