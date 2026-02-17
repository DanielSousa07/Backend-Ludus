import { Router } from "express";
import bcrypt from "bcryptjs";
import twilio from "twilio";

import { prisma } from "../lib/prisma";
import { login } from "../services/auth.service";

const router = Router();

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

router.post("/login", async (req, res) => {
  const { email, senha } = req.body;

  try {
    const data = await login(email, senha);
    return res.json(data);
  } catch (error: any) {
    return res.status(401).json({ error: error.message });
  }
});

router.post("/register", async (req, res) => {
  const { name, email, phone, senha } = req.body;

  try {
    const cleanName = (name || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPhone = phone ? String(phone).trim().replace(/\D/g, "") : null;

    if (!cleanName) return res.status(400).json({ error: "Nome é obrigatório." });
    if (!cleanEmail) return res.status(400).json({ error: "E-mail é obrigatório." });
    if (!senha) return res.status(400).json({ error: "Senha é obrigatória." });

    const emailExists = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (emailExists) return res.status(400).json({ error: "Este e-mail já está em uso." });

    if (cleanPhone) {
      const phoneExists = await prisma.user.findUnique({ where: { phone: cleanPhone } });
      if (phoneExists) return res.status(400).json({ error: "Telefone já cadastrado." });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    
    const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const now = new Date();

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(senha, salt);

    const newUser = await prisma.user.create({
      data: {
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        senhaHash: hash,
        verificationCode,
        codeExpiresAt,
         lastCodeSentAt: now,
        phoneVerified: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        phoneVerified: true,
        createdAt: true,
      },
    });

    if (cleanPhone) {
      await client.messages.create({
        body: `Seu código de verificação Ludus é: ${verificationCode}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: `+55${cleanPhone}`,
      });
    }

    return res.status(201).json({
      message: "Conta criada. Enviamos um SMS com o código.",
      user: newUser,
    });
  } catch (error: any) {
    console.log("ERRO REGISTER:", error);
    return res.status(400).json({ error: "Erro ao criar usuário" });
  }
});

router.post("/verify-phone", async (req, res) => {
  const { phone, code } = req.body;

  const cleanPhone = phone ? String(phone).trim().replace(/\D/g, "") : "";
  const cleanCode = code ? String(code).trim().replace(/\D/g, "") : "";

  if (!cleanPhone) return res.status(400).json({ error: "Telefone é obrigatório." });
  if (!cleanCode || cleanCode.length !== 6)
    return res.status(400).json({ error: "Código inválido." });

  const user = await prisma.user.findFirst({
    where: {
      phone: cleanPhone,
      verificationCode: cleanCode,
    },
  });

  if (!user) {
    return res.status(400).json({ error: "Código inválido ou expirado" });
  }

  
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


router.post("/resend-code", async (req, res) => {
  const { phone } = req.body;
  const cleanPhone = phone ? String(phone).trim().replace(/\D/g, "") : "";

  if (!cleanPhone) {
    return res.status(400).json({ error: "Telefone é obrigatório." });
  }

  const user = await prisma.user.findUnique({
    where: { phone: cleanPhone },
  });

  if (!user) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }

  
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

  const newCode = Math.floor(100000 + Math.random() * 900000).toString();
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

  await client.messages.create({
    body: `Seu novo código Ludus é: ${newCode}`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: `+55${cleanPhone}`,
  });

  return res.json({ message: "Novo código enviado com sucesso!" });
});


export default router;
