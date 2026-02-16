import { Router } from "express";
import { login } from "../services/auth.service";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma"
import twilio from "twilio";

const router = Router();

router.post("/login", async (req, res) => {
    const { email, senha } = req.body;

    try {
        const data = await login(email, senha);
        return res.json(data);
    } catch (error: any) {
        return res.status(401).json({ error: error.message });
    }
});


const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

router.post("/register", async (req, res) => {
    const { name, email, phone, senha } = req.body;
    try {
        const cleanEmail = email.trim().toLowerCase()
        const cleanPhone = phone ? phone.trim().replace(/\D/g, '') : null;

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        const emailExists = await prisma.user.findUnique({ where: { email: cleanEmail } });
        if (emailExists) {
            return res.status(400).json({ error: "Este e-mail já está em uso." })
        }

        if (cleanPhone) {
            const phoneExists = await prisma.user.findUnique({ where: { phone: cleanPhone } });
            if (phoneExists) return res.status(400).json({ error: "Telefone já cadastrado." });
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(senha, salt);

        const newUser = await prisma.user.create({
            data: {
                name,
                verificationCode,
                phoneVerified: false,
                email: cleanEmail,
                phone: cleanPhone,
                senhaHash: hash,
                password: senha
            }
        });
        await client.messages.create({
            body: `Seu código de verificação Ludus é: ${verificationCode}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: `+55${cleanPhone}` 
        });

        return res.status(201).json(newUser);
    } catch (error: any) {
        console.log("ERRO REAL DO PRISMA:", error);
        return res.status(400).json({ error: "Erro ao criar usuário" });
    }
});

router.post("/verify-phone", async (req, res) => {
    const { userId, code } = req.body;

    const user = await prisma.user.findUnique({
        where: { id: userId }
    });

    if (!user || user.verificationCode !== code) {
        return res.status(400).json({ error: "Código inválido ou expirado" });
    }

    
    await prisma.user.update({
        where: { id: userId },
        data: { 
            phoneVerified: true,
            verificationCode: null 
        }
    });

    return res.json({ message: "Telefone verificado com sucesso!" });
});

export default router;