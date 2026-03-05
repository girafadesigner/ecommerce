const nodemailer = require("nodemailer");

function maskEmail(email) {
  const [name, domain] = String(email || "").split("@");
  if (!name || !domain) return email;
  const visible = name.slice(0, 2);
  return `${visible}***@${domain}`;
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function maskPhone(phone) {
  const value = normalizePhone(phone);
  if (value.length < 4) return value;
  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

async function sendByEmail({ to, code, name }) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass || !from) {
    throw new Error("Canal email indisponivel: configure SMTP_HOST, SMTP_USER, SMTP_PASS e SMTP_FROM.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  await transporter.sendMail({
    from,
    to,
    subject: "Codigo de recuperacao de senha - Girafa Designer",
    text: `Ola ${name || ""}. Seu codigo de recuperacao e: ${code}. Validade: 15 minutos.`,
    html: `<p>Ola ${name || ""},</p><p>Seu codigo de recuperacao e:</p><h2>${code}</h2><p>Validade: 15 minutos.</p>`
  });

  return { channel: "email", destination: maskEmail(to) };
}

async function sendBySms({ to, code, name }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const normalizedTo = normalizePhone(to);

  if (!accountSid || !authToken || !from) {
    throw new Error(
      "Canal sms indisponivel: configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_FROM_NUMBER."
    );
  }

  const payload = new URLSearchParams({
    To: `+${normalizedTo}`,
    From: from,
    Body: `Girafa Designer: codigo de recuperacao ${code}. Valido por 15 minutos. ${name || ""}`.trim()
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: payload
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha ao enviar SMS: ${errorText}`);
  }

  return { channel: "sms", destination: maskPhone(normalizedTo) };
}

async function sendByWhatsapp({ to, code, name }) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const normalizedTo = normalizePhone(to);

  if (!token || !phoneNumberId) {
    throw new Error(
      "Canal whatsapp indisponivel: configure WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID."
    );
  }

  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizedTo,
      type: "text",
      text: {
        body: `Girafa Designer\nCodigo de recuperacao: ${code}\nValido por 15 minutos.\n${name || ""}`
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha ao enviar WhatsApp: ${errorText}`);
  }

  return { channel: "whatsapp", destination: maskPhone(normalizedTo) };
}

async function sendRecoveryCode({ channel, email, phone, code, name }) {
  const useMock = process.env.ENABLE_MOCK_NOTIFICATIONS === "true";
  const selected = String(channel || "email").toLowerCase();

  if (selected !== "email") {
    throw new Error("Canal de envio invalido. Somente email esta habilitado.");
  }

  if (useMock) {
    return {
      channel: "email",
      destination: maskEmail(email)
    };
  }

  return sendByEmail({ to: email, code, name });
}

module.exports = {
  sendRecoveryCode
};
