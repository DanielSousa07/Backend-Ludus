import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {prisma} from "../lib/prisma";

export async function login(email: string, senha: string) {
    // 1. Procura o utilizador pelo email
    const user = await prisma.user.findUnique({
        where: { email },        
    });

    // 2. Verifica se o utilizador existe e tem uma senha gravada
    if (!user || !user.senhaHash) {
        throw new Error("Usuário ou senha inválidos");
    }

    // 3. Compara a senha enviada com o hash do banco
    const senhaValida = await bcrypt.compare(senha, user.senhaHash);

    if (!senhaValida) {
        throw new Error("Usuário ou senha inválidos");
    }

    // 4. Gera o Token (usa a chave do teu .env)
    const token = jwt.sign(
        { id: user.id,
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