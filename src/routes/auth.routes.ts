import jwt from "jsonwebtoken";
import { Router } from "express";
import bcrypt from "bcryptjs";
import twilio from "twilio";
import { Resend } from "resend";

import { prisma } from "../lib/prisma";
import { login, loginWithGoogle } from "../services/auth.service";

const router = Router();

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const resend = new Resend(process.env.RESEND_API_KEY);

function gen6() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanDigits(v: any) {
  return v ? String(v).trim().replace(/\D/g, "") : "";
}

function isPendingExpired(createdAt: Date) {
  const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
  return Date.now() - createdAt.getTime() > PENDING_TTL_MS;
}

function buildUserResponse(user: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  points: number;
  level: number;
  authProvider: string;
  avatar: string | null;
  picture: string | null;
}) {
  return {
    id: user.id,
    nome: user.name,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    points: user.points,
    level: user.level,
    authProvider: user.authProvider,
    avatar: user.avatar,
    picture: user.picture,
  };
}

function signUserToken(userId: string, role: string) {
  return jwt.sign(
    { role },
    process.env.JWT_SECRET || "secret_fallback",
    {
      subject: userId,
      expiresIn: "7d",
    }
  );
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

router.post("/google", async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: "idToken é obrigatório" });
  }

  try {
    const result = await loginWithGoogle(idToken);
    return res.json(result);
  } catch (err: any) {
    console.error("ERRO /auth/google:", err);

    const prismaCode = err?.code;
    const msg = err?.message || "Falha ao autenticar com Google";

    const isAuthError =
      msg.toLowerCase().includes("token") ||
      msg.toLowerCase().includes("jwt") ||
      msg.toLowerCase().includes("audience") ||
      msg.toLowerCase().includes("invalid");

    if (isAuthError) {
      return res.status(401).json({ error: msg });
    }

    return res.status(500).json({
      error: msg,
      prismaCode,
    });
  }
});

router.post("/register", async (req, res) => {
  const { name, email, phone, senha, acceptedTerms, acceptedPrivacy } = req.body;

  try {
    const cleanName = (name || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPhone = phone ? cleanDigits(phone) : null;

    if (!cleanName) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }

    if (!cleanEmail) {
      return res.status(400).json({ error: "E-mail é obrigatório." });
    }

    if (!senha) {
      return res.status(400).json({ error: "Senha é obrigatória." });
    }

    if (!acceptedTerms || !acceptedPrivacy) {
      return res.status(400).json({
        error: "Você precisa aceitar os Termos de Uso e a Política de Privacidade.",
      });
    }

    // limpa pendências antigas
    await prisma.pendingRegistration.deleteMany({
      where: {
        createdAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    // usuário real já existe?
    const emailExists = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (emailExists) {
      return res.status(400).json({ error: "Este e-mail já está em uso." });
    }

    if (cleanPhone) {
      const phoneExists = await prisma.user.findUnique({
        where: { phone: cleanPhone },
      });

      if (phoneExists) {
        return res.status(400).json({ error: "Telefone já cadastrado." });
      }
    }

    const pendingExists = await prisma.pendingRegistration.findUnique({
      where: { email: cleanEmail },
    });

    if (pendingExists) {
      if (isPendingExpired(pendingExists.createdAt)) {
        await prisma.pendingRegistration.delete({
          where: { id: pendingExists.id },
        });
      } else {
        if (pendingExists.lastEmailSentAt) {
          const elapsed = Date.now() - pendingExists.lastEmailSentAt.getTime();
          const waitMs = 30_000 - elapsed;

          if (waitMs > 0) {
            const retryAfterSec = Math.ceil(waitMs / 1000);
            return res.status(429).json({
              error: `Aguarde ${retryAfterSec} segundos antes de tentar novamente.`,
              code: "WAIT_BEFORE_RESEND",
              retryAfter: retryAfterSec,
            });
          }
        }

        const hash = await bcrypt.hash(senha, 10);
        const emailCode = gen6();
        const emailExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await prisma.pendingRegistration.update({
          where: { id: pendingExists.id },
          data: {
            name: cleanName,
            phone: cleanPhone,
            senhaHash: hash,
            acceptedTerms,
            acceptedPrivacy,
            emailVerificationCode: emailCode,
            emailCodeExpiresAt: emailExpiresAt,
            lastEmailSentAt: new Date(),
            emailVerified: false,
            phoneVerified: false,
          },
        });

        try {
          await resend.emails.send({
            from: process.env.RESEND_FROM!,
            to: [cleanEmail],
            subject: "Seu novo código de verificação - Ludus",
            html: `
              <div style="font-family: Arial, sans-serif;">
                <h2>Verificação de e-mail</h2>
                <p>Seu novo código é:</p>
                <div style="font-size: 28px; letter-spacing: 6px; font-weight: 700;">
                  ${emailCode}
                </div>
                <p>Esse código expira em 10 minutos.</p>
              </div>
            `,
          });
        } catch (e) {
          console.log("Falha ao enviar e-mail (Resend):", e);
        }

        return res.status(200).json({
          message: "Cadastro pendente atualizado. Enviamos um novo código por e-mail.",
        });
      }
    }

    const hash = await bcrypt.hash(senha, 10);
    const emailCode = gen6();
    const emailExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.pendingRegistration.create({
      data: {
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        senhaHash: hash,
        acceptedTerms,
        acceptedPrivacy,
        emailVerificationCode: emailCode,
        emailCodeExpiresAt: emailExpiresAt,
        lastEmailSentAt: new Date(),
      },
    });

    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM!,
        to: [cleanEmail],
        subject: "Código de verificação - Ludus",
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
    }

    return res.status(201).json({
      message: "Cadastro iniciado. Verifique seu e-mail.",
    });
  } catch (err) {
    console.log("ERRO REGISTER:", err);
    return res.status(400).json({ error: "Erro ao iniciar cadastro" });
  }
});

router.post("/verify-email", async (req, res) => {
  const { email, code } = req.body;

  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanCode = cleanDigits(code);

  if (!cleanEmail) {
    return res.status(400).json({ error: "E-mail é obrigatório." });
  }

  if (!cleanCode || cleanCode.length !== 6) {
    return res.status(400).json({ error: "Código inválido." });
  }

  const pending = await prisma.pendingRegistration.findFirst({
    where: {
      email: cleanEmail,
      emailVerificationCode: cleanCode,
    },
  });

  if (!pending) {
    return res.status(400).json({ error: "Código inválido." });
  }

  if (isPendingExpired(pending.createdAt)) {
    await prisma.pendingRegistration.delete({
      where: { id: pending.id },
    });

    return res.status(400).json({
      error: "Esse cadastro expirou. Faça o cadastro novamente.",
      code: "PENDING_REGISTRATION_EXPIRED",
    });
  }

  if (
    pending.emailCodeExpiresAt &&
    pending.emailCodeExpiresAt.getTime() < Date.now()
  ) {
    return res.status(400).json({ error: "Código expirado." });
  }

  const alreadyExists = await prisma.user.findUnique({
    where: { email: pending.email },
  });

  if (alreadyExists) {
    await prisma.pendingRegistration.delete({
      where: { id: pending.id },
    });

    return res.status(400).json({
      error: "Conta já foi criada para este e-mail.",
    });
  }

  const user = await prisma.user.create({
    data: {
      name: pending.name,
      email: pending.email,
      phone: pending.phone,
      senhaHash: pending.senhaHash,
      emailVerified: true,
      phoneVerified: false,
      termsAcceptedAt: pending.acceptedTerms ? new Date() : null,
      privacyAcceptedAt: pending.acceptedPrivacy ? new Date() : null,
    },
  });

  await prisma.pendingRegistration.delete({
    where: { id: pending.id },
  });

  const token = signUserToken(user.id, user.role);

  return res.json({
    message: "Conta criada com sucesso!",
    token,
    user: buildUserResponse(user),
  });
});

router.post("/resend-email-code", async (req, res) => {
  const { email } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanEmail) {
    return res.status(400).json({ error: "E-mail é obrigatório." });
  }

  const pending = await prisma.pendingRegistration.findUnique({
    where: { email: cleanEmail },
  });

  if (!pending) {
    return res.status(404).json({ error: "Cadastro não encontrado." });
  }

  if (isPendingExpired(pending.createdAt)) {
    await prisma.pendingRegistration.delete({
      where: { id: pending.id },
    });

    return res.status(400).json({
      error: "Esse cadastro expirou. Faça o cadastro novamente.",
      code: "PENDING_REGISTRATION_EXPIRED",
    });
  }

  if (pending.lastEmailSentAt) {
    const elapsed = Date.now() - pending.lastEmailSentAt.getTime();
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

  await prisma.pendingRegistration.update({
    where: { id: pending.id },
    data: {
      emailVerificationCode: emailCode,
      emailCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      lastEmailSentAt: new Date(),
    },
  });

  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM!,
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
  } catch (e) {
    console.log("Falha ao enviar e-mail (Resend):", e);
  }

  return res.json({ message: "Novo código enviado por e-mail!" });
});

/**
 * A partir daqui, estas rotas assumem que o usuário JÁ EXISTE.
 * Ou seja: são úteis para validar telefone depois que a conta já foi criada.
 */
router.post("/verify-phone", async (req, res) => {
  const { phone, code } = req.body;

  const cleanPhone = cleanDigits(phone);
  const cleanCode = cleanDigits(code);

  if (!cleanPhone) {
    return res.status(400).json({ error: "Telefone é obrigatório." });
  }

  if (!cleanCode || cleanCode.length !== 6) {
    return res.status(400).json({ error: "Código inválido." });
  }

  const user = await prisma.user.findFirst({
    where: {
      phone: cleanPhone,
      verificationCode: cleanCode,
    },
  });

  if (!user) {
    return res.status(400).json({ error: "Código inválido ou expirado." });
  }

  if (user.codeExpiresAt && user.codeExpiresAt.getTime() < Date.now()) {
    return res.status(400).json({ error: "Código expirado." });
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      phoneVerified: true,
      verificationCode: null,
      codeExpiresAt: null,
    },
  });

  const token = signUserToken(updatedUser.id, updatedUser.role);

  return res.json({
    message: "Telefone verificado com sucesso!",
    token,
    user: buildUserResponse(updatedUser),
  });
});

router.post("/resend-code", async (req, res) => {
  const { phone } = req.body;
  const cleanPhone = cleanDigits(phone);

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