import { Router } from "express";
import bcrypt from "bcryptjs";
import twilio from "twilio";
import { Resend } from "resend";

import { prisma } from "../lib/prisma";
import { login } from "../services/auth.service";

const router = Router();

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const resend = new Resend(process.env.RESEND_API_KEY);

// helpers
function gen6() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
function cleanDigits(v: any) {
  return v ? String(v).trim().replace(/\D/g, "") : "";
}

router.post("/login", async (req, res) => {
  const { email, senha } = req.body;

  try {
    const data = await login(email, senha);
    return res.json(data);
  } catch (error: any) {
    return res.status(401).json({ error: error.message });
  }
});

// ✅ REGISTER: cria conta e envia código por EMAIL (não envia SMS)
router.post("/register", async (req, res) => {
  const { name, email, phone, senha } = req.body;

  try {
    const cleanName = (name || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPhone = phone ? cleanDigits(phone) : null;

    if (!cleanName) return res.status(400).json({ error: "Nome é obrigatório." });
    if (!cleanEmail) return res.status(400).json({ error: "E-mail é obrigatório." });
    if (!senha) return res.status(400).json({ error: "Senha é obrigatória." });

    const emailExists = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (emailExists) return res.status(400).json({ error: "Este e-mail já está em uso." });

    if (cleanPhone) {
      const phoneExists = await prisma.user.findUnique({ where: { phone: cleanPhone } });
      if (phoneExists) return res.status(400).json({ error: "Telefone já cadastrado." });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(senha, salt);

    const emailCode = gen6();
    const now = new Date();
    const emailExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const newUser = await prisma.user.create({
      data: {
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        senhaHash: hash,

        // email verification
        emailVerified: false,
        emailVerificationCode: emailCode,
        emailCodeExpiresAt: emailExpiresAt,
        lastEmailSentAt: now,

        // sms (opcional)
        phoneVerified: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        emailVerified: true,
        phoneVerified: true,
        createdAt: true,
      },
    });

    // envia email (não quebrar registro se falhar)
    try {
      const from = process.env.RESEND_FROM || "Ludus <onboarding@resend.dev>";
      await resend.emails.send({
        from,
        to: [cleanEmail],
        subject: "Seu código de verificação - Ludus",
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>Verificação de e-mail</h2>
            <p>Seu código é:</p>
            <div style="font-size: 28px; letter-spacing: 6px; font-weight: 700;">
              ${emailCode}
            </div>
            <p>Esse código expira em 10 minutos.</p>
          </div>
        `,
      });
    } catch (e) {
      console.log("Falha ao enviar e-mail (Resend):", e);
      // registra ok mesmo assim — user pode pedir reenviar
    }

    return res.status(201).json({
      message: "Conta criada. Enviamos um código por e-mail.",
      user: newUser,
    });
  } catch (error: any) {
    console.log("ERRO REGISTER:", error);
    return res.status(400).json({ error: "Erro ao criar usuário" });
  }
});

// ✅ VERIFY EMAIL (obrigatório para liberar /home)
router.post("/verify-email", async (req, res) => {
  const { email, code } = req.body;

  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanCode = cleanDigits(code);

  if (!cleanEmail) return res.status(400).json({ error: "E-mail é obrigatório." });
  if (!cleanCode || cleanCode.length !== 6) return res.status(400).json({ error: "Código inválido." });

  const user = await prisma.user.findFirst({
    where: {
      email: cleanEmail,
      emailVerificationCode: cleanCode,
    },
  });

  if (!user) {
    return res.status(400).json({ error: "Código inválido." });
  }

  if (user.emailCodeExpiresAt && user.emailCodeExpiresAt.getTime() < Date.now()) {
    return res.status(400).json({ error: "Código expirado." });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      emailVerificationCode: null,
      emailCodeExpiresAt: null,
    },
    select: { id: true },
  });

  return res.json({ message: "E-mail verificado com sucesso!" });
});

// ✅ RESEND EMAIL CODE (30s cooldown)
router.post("/resend-email-code", async (req, res) => {
  const { email } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanEmail) return res.status(400).json({ error: "E-mail é obrigatório." });

  const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
  if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

  if (user.lastEmailSentAt) {
    const elapsed = Date.now() - user.lastEmailSentAt.getTime();
    const waitMs = 30_000 - elapsed;
    if (waitMs > 0) {
      const retryAfterSec = Math.ceil(waitMs / 1000);
      return res.status(429).json({
        error: `Aguarde ${retryAfterSec} segundos antes de reenviar.`,
        code: "WAIT_BEFORE_RESEND",
        retryAfter: retryAfterSec,
      });
    }
  }

  const emailCode = gen6();
  const now = new Date();
  const emailExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificationCode: emailCode,
      emailCodeExpiresAt: emailExpiresAt,
      lastEmailSentAt: now,
    },
  });

  const from = process.env.RESEND_FROM || "Ludus <onboarding@resend.dev>";
  await resend.emails.send({
    from,
    to: [cleanEmail],
    subject: "Novo código de verificação - Ludus",
    html: `
      <div style="font-family: Arial, sans-serif;">
        <h2>Novo código</h2>
        <div style="font-size: 28px; letter-spacing: 6px; font-weight: 700;">
          ${emailCode}
        </div>
        <p>Esse código expira em 10 minutos.</p>
      </div>
    `,
  });

  return res.json({ message: "Novo código enviado por e-mail!" });
});

// ------------------- SMS (opcional) -------------------
// Mantive sua rota /verify-phone e /resend-code. Você pode usar depois no perfil.

// verify phone (quando user escolher SMS)
router.post("/verify-phone", async (req, res) => {
  const { phone, code } = req.body;

  const cleanPhone = cleanDigits(phone);
  const cleanCode = cleanDigits(code);

  if (!cleanPhone) return res.status(400).json({ error: "Telefone é obrigatório." });
  if (!cleanCode || cleanCode.length !== 6) return res.status(400).json({ error: "Código inválido." });

  const user = await prisma.user.findFirst({
    where: {
      phone: cleanPhone,
      verificationCode: cleanCode,
    },
  });

  if (!user) return res.status(400).json({ error: "Código inválido ou expirado" });

  if (user.codeExpiresAt && user.codeExpiresAt.getTime() < Date.now()) {
    return res.status(400).json({ error: "Código expirado" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      phoneVerified: true,
      verificationCode: null,
      codeExpiresAt: null,
    },
    select: { id: true },
  });

  return res.json({ message: "Telefone verificado com sucesso!" });
});

// resend sms (quando user escolher SMS)
router.post("/resend-code", async (req, res) => {
  const { phone } = req.body;
  const cleanPhone = cleanDigits(phone);

  if (!cleanPhone) return res.status(400).json({ error: "Telefone é obrigatório." });

  const user = await prisma.user.findUnique({ where: { phone: cleanPhone } });
  if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

  if (user.lastCodeSentAt) {
    const elapsed = Date.now() - user.lastCodeSentAt.getTime();
    const waitMs = 30_000 - elapsed;

    if (waitMs > 0) {
      const retryAfterSec = Math.ceil(waitMs / 1000);
      return res.status(429).json({
        error: `Aguarde ${retryAfterSec} segundos antes de reenviar.`,
        code: "WAIT_BEFORE_RESEND",
        retryAfter: retryAfterSec,
      });
    }
  }

  const newCode = gen6();
  const now = new Date();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      verificationCode: newCode,
      codeExpiresAt: expiresAt,
      lastCodeSentAt: now,
    },
  });

  // ⚠️ Twilio trial pode falhar — retorna erro amigável
  try {
    await client.messages.create({
      body: `Seu código de verificação Ludus é: ${newCode}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: `+55${cleanPhone}`,
    });
  } catch (e) {
    return res.status(400).json({
      error: "SMS indisponível no momento. Use verificação por e-mail.",
      code: "SMS_UNAVAILABLE",
    });
  }

  return res.json({ message: "Novo código enviado por SMS!" });
});

export default router;
