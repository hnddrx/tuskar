import test from "node:test";
import assert from "node:assert/strict";

import {
  SMTP_PRESETS,
  presetByKey,
  buildTransportOptions,
  validateSmtpConfig,
  describeSmtpError,
  formatSender,
} from "./smtp.js";

const VALID = {
  host: "smtp.gmail.com",
  port: 587,
  security: "starttls",
  username: "me@gmail.com",
  password: "app-password",
  fromName: "Taskar",
  fromEmail: "me@gmail.com",
};

// --- presets ---------------------------------------------------------------

test("Gmail is offered as a preset with its real settings", () => {
  const gmail = presetByKey("gmail");
  assert.equal(gmail.host, "smtp.gmail.com");
  assert.equal(gmail.port, 587);
  assert.equal(gmail.security, "starttls");
});

test("every preset carries the fields the form needs", () => {
  for (const preset of SMTP_PRESETS) {
    assert.ok(preset.key, "preset needs a key");
    assert.ok(preset.label, "preset needs a label");
    if (preset.key !== "custom") {
      assert.ok(preset.host, `${preset.key} needs a host`);
      assert.ok(preset.port, `${preset.key} needs a port`);
    }
  }
});

test("an unknown preset key resolves to nothing rather than throwing", () => {
  assert.equal(presetByKey("nope"), null);
});

// --- transport options -----------------------------------------------------

test("STARTTLS uses port 587 without implicit TLS", () => {
  const opts = buildTransportOptions(VALID);
  assert.equal(opts.host, "smtp.gmail.com");
  assert.equal(opts.port, 587);
  assert.equal(opts.secure, false);
  assert.equal(opts.requireTLS, true);
});

test("SSL/TLS connects with implicit TLS", () => {
  const opts = buildTransportOptions({ ...VALID, security: "ssl", port: 465 });
  assert.equal(opts.secure, true);
  assert.equal(opts.requireTLS, undefined);
});

test("an unsecured connection neither requires nor implies TLS", () => {
  const opts = buildTransportOptions({ ...VALID, security: "none", port: 25 });
  assert.equal(opts.secure, false);
  assert.equal(opts.requireTLS, undefined);
});

test("credentials are passed as auth when a username is set", () => {
  assert.deepEqual(buildTransportOptions(VALID).auth, {
    user: "me@gmail.com",
    pass: "app-password",
  });
});

test("a server that needs no login gets no auth block", () => {
  const opts = buildTransportOptions({ ...VALID, username: "", password: "" });
  assert.equal(opts.auth, undefined);
});

// --- validation ------------------------------------------------------------

test("a complete configuration is valid", () => {
  assert.deepEqual(validateSmtpConfig(VALID), []);
});

test("the host is required", () => {
  const errors = validateSmtpConfig({ ...VALID, host: "" });
  assert.match(errors.join(" "), /server/i);
});

test("the port must be a real port number", () => {
  assert.match(validateSmtpConfig({ ...VALID, port: 0 }).join(" "), /port/i);
  assert.match(validateSmtpConfig({ ...VALID, port: 70000 }).join(" "), /port/i);
});

test("the from address is required and must look like an address", () => {
  assert.match(validateSmtpConfig({ ...VALID, fromEmail: "" }).join(" "), /from address/i);
  assert.match(validateSmtpConfig({ ...VALID, fromEmail: "nope" }).join(" "), /from address/i);
});

test("a username without a password is rejected", () => {
  const errors = validateSmtpConfig({ ...VALID, password: "" });
  assert.match(errors.join(" "), /password/i);
});

test("a username with no password is fine when a password is already stored", () => {
  assert.deepEqual(validateSmtpConfig({ ...VALID, password: "" }, { hasStoredPassword: true }), []);
});

test("an unknown security mode is rejected", () => {
  assert.match(validateSmtpConfig({ ...VALID, security: "magic" }).join(" "), /security/i);
});

// --- sender formatting -----------------------------------------------------

test("a sender with a name is formatted for the From header", () => {
  assert.equal(formatSender(VALID), "Taskar <me@gmail.com>");
});

test("a sender without a name is just the address", () => {
  assert.equal(formatSender({ ...VALID, fromName: "" }), "me@gmail.com");
});

test("a name containing a quote cannot break the From header", () => {
  const sender = formatSender({ ...VALID, fromName: 'Ta"skar' });
  assert.doesNotMatch(sender, /"[^<]*"[^<]*"/);
});

// --- error messages --------------------------------------------------------

test("a rejected login is explained as a credentials problem", () => {
  const message = describeSmtpError({ code: "EAUTH", response: "535 bad password" });
  assert.match(message, /username or password/i);
});

test("Gmail's app-password requirement is called out on an auth failure", () => {
  const message = describeSmtpError(
    { code: "EAUTH", response: "535" },
    { host: "smtp.gmail.com" }
  );
  assert.match(message, /app password/i);
});

test("an unreachable server is explained as a connection problem", () => {
  assert.match(describeSmtpError({ code: "ECONNREFUSED" }), /could not connect|refused/i);
});

test("a timeout is reported as a timeout", () => {
  assert.match(describeSmtpError({ code: "ETIMEDOUT" }), /timed out/i);
});

test("a TLS failure mentions the security setting", () => {
  assert.match(describeSmtpError({ code: "ESOCKET", message: "wrong version number" }), /security/i);
});

test("an unrecognised failure still says something useful", () => {
  const message = describeSmtpError({ message: "kaboom" });
  assert.match(message, /kaboom/);
});

test("a missing error object does not crash the caller", () => {
  assert.equal(typeof describeSmtpError(null), "string");
});

test("a refused connection reported as a socket error is not blamed on TLS", () => {
  // nodemailer wraps a refused connection as ESOCKET too, so the code alone
  // cannot tell a TLS mismatch from nothing listening on the port.
  const message = describeSmtpError({
    code: "ESOCKET",
    syscall: "connect",
    message: "connect ECONNREFUSED 127.0.0.1:2",
  });
  assert.match(message, /refused|could not connect/i);
  assert.doesNotMatch(message, /security setting/i);
});

test("a genuine TLS mismatch still points at the security setting", () => {
  const message = describeSmtpError({
    code: "ESOCKET",
    message: "wrong version number",
  });
  assert.match(message, /security setting/i);
});
