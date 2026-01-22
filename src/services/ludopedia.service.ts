import axios from "axios";

export async function searchLudopedia(query: string) {
    const API_KEY = process.env.LUDOPEDIA_API_KEY
    const URL = `https://ludopedia.com.br/api/v1/jogos`;

    try {
        const response = await axios.get(URL, {
            params: { search: query },
            headers: { "Authorization": `Bearer ${API_KEY}` }
        });


        console.log("RESPOSTA REAL DA LUDOPEDIA:", JSON.stringify(response.data, null, 2));

        if (!response.data || !response.data.jogos) {
            console.log("Aviso: Nenhum campo 'jogos' encontrado na resposta.");
            return [];
        }
        return response.data.jogos.map((j: any) => ({
            // Tenta pegar id_jogo ou id, nm_jogo ou nome
            id: j.id_jogo || j.id,
            name: j.nm_jogo || j.nome || j.name,
            image: j.thumb || j.imagem || j.img
        }));

    } catch (error: any) {
        // Log para veres o erro real no terminal do VS Code
        console.error("Erro na API Ludopedia:", error.response?.data || error.message);
        throw new Error("Erro ao consultar Ludopedia");
    }
}