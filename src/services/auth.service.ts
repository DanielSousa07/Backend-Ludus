import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";


export async function login(emailOrPhone: string, senha: string) {
    
    const cleanInput = emailOrPhone.trim().toLowerCase();
    const onlyNumbers = emailOrPhone.replace(/\D/g, '');

    
    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { email: cleanInput },
                { phone: onlyNumbers !== '' ? onlyNumbers : undefined }
            ]
        },
    });

    if (!user || !user.senhaHash) {
        throw new Error("Usuário ou senha inválidos");
    }

    
    const senhaValida = await bcrypt.compare(senha, user.senhaHash);

    if (!senhaValida) {
        throw new Error("Usuário ou senha inválidos");
    }

    const token = jwt.sign(
        { 
            id: user.id,
            role: user.role
        },
        process.env.JWT_SECRET || "secret_fallback",
        { expiresIn: "7d" }
    );

    return {
        token, 
        user: {
            id: user.id,
            nome: user.name,
            email: user.email,
            role: user.role
        },
    };
}