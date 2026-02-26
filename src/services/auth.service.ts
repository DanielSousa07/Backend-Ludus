import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { OAuth2Client } from "google-auth-library";
import {jwtDecode} from "jwt-decode";

export async function login(emailOrPhone: string, senha: string) {
  const cleanInput = (emailOrPhone || "").trim().toLowerCase();
  const onlyNumbers = (emailOrPhone || "").replace(/\D/g, "");

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: cleanInput },
        ...(onlyNumbers ? [{ phone: onlyNumbers }] : []),
      ],
    },
  });

  if (!user) {
    throw new Error("Usuário ou senha inválidos");
  }

  
  if (user.authProvider === "GOOGLE") {
    throw new Error("Essa conta usa login com Google. Entre com Google.");
  }

  if (!user.senhaHash) {
    throw new Error("Usuário ou senha inválidos");
  }

  const senhaValida = await bcrypt.compare(senha, user.senhaHash);
  if (!senhaValida) {
    throw new Error("Usuário ou senha inválidos");
  }

  const token = jwt.sign(
    { role: user.role },
    process.env.JWT_SECRET || "secret_fallback",
    { subject: user.id, expiresIn: "7d" }
  );

  return {
    token,
    user: {
      id: user.id,
      nome: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      points: user.points,
      level: user.level,
      authProvider: user.authProvider,
    },
  };
}

const googleClient = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID);

export async function loginWithGoogle(idToken: string) {
  console.log("Token recebido na API:", idToken?.substring(0, 50));
  if (!process.env.GOOGLE_WEB_CLIENT_ID) {
    throw new Error("GOOGLE_WEB_CLIENT_ID não configurado");
  }
  


  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_WEB_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload) throw new Error("Token inválido");

  const email = payload.email?.toLowerCase().trim();
  if (!email) throw new Error("Email não fornecido pelo Google");

  const name = payload.name ?? "Usuário";
  const googleSub = payload.sub;
  const emailVerified = payload.email_verified ?? true;

  let user = await prisma.user.findUnique({ where: { email } });

 if (!user) {
  user = await prisma.user.create({
    data: {
      name,
      email,
      emailVerified: true,        
      phone: null,                
      phoneVerified: false,       
      googleSub,
      authProvider: "GOOGLE",
      senhaHash: null,
      points: 0,
      level: 1,
    },
  });
} else {
  
  user = await prisma.user.update({
    where: { id: user.id },
    data: {
      googleSub: user.googleSub ?? googleSub,
      authProvider: "GOOGLE",
      emailVerified: true,
    },
  });
}

  const token = jwt.sign(
    { role: user.role },
    process.env.JWT_SECRET || "secret_fallback",
    { subject: user.id, expiresIn: "7d" }
  );

  return {
    token,
    user: {
      id: user.id,
      nome: user.name, 
      email: user.email,
      phone: user.phone,
      role: user.role,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      points: user.points,
      level: user.level,
      authProvider: user.authProvider,
    },
    needsPhoneVerification: !user.phone || !user.phoneVerified,
  };
}