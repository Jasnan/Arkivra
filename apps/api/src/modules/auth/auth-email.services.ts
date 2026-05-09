import type { Config } from '../config/config.js';
import { connect as connectTls } from 'node:tls';
import { connect as connectTcp } from 'node:net';
import { once } from 'node:events';

export type SendAuthEmailInput = {
  to: string;
  subject: string;
  text: string;
};

type SmtpConnection = ReturnType<typeof connectTcp> | ReturnType<typeof connectTls>;

function encodeHeader(value: string) {
  return value.replaceAll('\r', '').replaceAll('\n', ' ');
}

function dotStuff(value: string) {
  return value.replace(/^\./gm, '..');
}

async function readSmtpResponse(socket: SmtpConnection) {
  let response = '';

  while (true) {
    const [chunk] = await once(socket, 'data') as [Buffer];
    response += chunk.toString('utf8');

    const lines = response.split(/\r?\n/).filter(Boolean);
    const lastLine = lines.at(-1);

    if (lastLine && /^\d{3} /.test(lastLine)) {
      const code = Number.parseInt(lastLine.slice(0, 3), 10);
      if (code >= 400) {
        throw new Error(`SMTP command failed: ${lastLine}`);
      }

      return response;
    }
  }
}

async function writeSmtpCommand(socket: SmtpConnection, command: string) {
  socket.write(`${command}\r\n`);
  return readSmtpResponse(socket);
}

async function connectSmtp(config: Config): Promise<SmtpConnection> {
  const host = config.email.smtpHost;
  const port = config.email.smtpPort;

  if (!host || !port) {
    throw new Error('SMTP host and port are required when email delivery uses SMTP.');
  }

  const secure = config.email.smtpSecure;
  const socket = secure
    ? connectTls({ host, port, servername: host })
    : connectTcp({ host, port });

  await once(socket, secure ? 'secureConnect' : 'connect');
  await readSmtpResponse(socket);

  return socket;
}

async function sendSmtpEmail(config: Config, input: SendAuthEmailInput) {
  let socket = await connectSmtp(config);
  const hostName = 'arkivra.local';

  try {
    await writeSmtpCommand(socket, `EHLO ${hostName}`);

    if (!config.email.smtpSecure && config.email.smtpStartTls) {
      await writeSmtpCommand(socket, 'STARTTLS');
      const tlsSocket = connectTls({
        socket,
        servername: config.email.smtpHost,
      });
      await once(tlsSocket, 'secureConnect');
      socket = tlsSocket;
      await writeSmtpCommand(socket, `EHLO ${hostName}`);
    }

    if (config.email.smtpUser && config.email.smtpPassword) {
      const auth = Buffer.from(`\0${config.email.smtpUser}\0${config.email.smtpPassword}`).toString(
        'base64',
      );
      await writeSmtpCommand(socket, `AUTH PLAIN ${auth}`);
    }

    const from = config.email.from;
    if (!from) {
      throw new Error('Email from address is required when email delivery uses SMTP.');
    }

    await writeSmtpCommand(socket, `MAIL FROM:<${from}>`);
    await writeSmtpCommand(socket, `RCPT TO:<${input.to}>`);
    await writeSmtpCommand(socket, 'DATA');

    const message = [
      `From: ${encodeHeader(config.email.fromName)} <${from}>`,
      `To: <${input.to}>`,
      `Subject: ${encodeHeader(input.subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      dotStuff(input.text),
      '.',
    ].join('\r\n');

    await writeSmtpCommand(socket, message);
    await writeSmtpCommand(socket, 'QUIT');
  } finally {
    socket.end();
  }
}

export function createAuthEmailServices({ config }: { config: Config }) {
  if (
    config.env === 'production' &&
    config.auth.isEmailVerificationRequired &&
    config.email.delivery === 'console'
  ) {
    throw new Error(
      'Email verification is required in production, but ARKIVRA_EMAIL_DELIVERY is set to console. Configure SMTP before starting Arkivra.',
    );
  }

  if (config.email.delivery === 'smtp') {
    const missingFields = [
      ['ARKIVRA_EMAIL_FROM', config.email.from],
      ['ARKIVRA_SMTP_HOST', config.email.smtpHost],
      ['ARKIVRA_SMTP_PORT', config.email.smtpPort],
    ].flatMap(([name, value]) => (value ? [] : [name]));

    if (missingFields.length > 0) {
      throw new Error(`SMTP email delivery is missing required settings: ${missingFields.join(', ')}`);
    }
  }

  async function sendEmail(input: SendAuthEmailInput) {
    if (config.email.delivery === 'console') {
      console.info(`[Auth email] To: ${input.to}`);
      console.info(`[Auth email] Subject: ${input.subject}`);
      console.info(input.text);
      return;
    }

    await sendSmtpEmail(config, input);
  }

  return { sendEmail };
}
