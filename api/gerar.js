// Intermediário seguro LB — geração de anúncios com IA (texto + leitura de foto)
// A chave fica na variável de ambiente OPENAI_API_KEY (configurada na Vercel, nunca no código)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const chave = process.env.OPENAI_API_KEY;
  if (!chave) return res.status(500).json({ erro: 'Chave da OpenAI não configurada na Vercel.' });

  try {
    const { produto, marketplace, imagem } = req.body || {};
    if ((!produto || !produto.trim()) && !imagem) {
      return res.status(400).json({ erro: 'Descreva o produto ou envie uma foto.' });
    }

    const nomeMk = marketplace === 'shopee' ? 'Shopee' : 'Mercado Livre';
    const limiteTitulo = marketplace === 'shopee' ? 100 : 60;

    // Regras de título específicas por marketplace
    const regraTitulo = marketplace === 'shopee'
      ? `REGRAS DO TÍTULO (Shopee) - siga TODAS com rigor:
1. CAPITALIZAÇÃO: use Iniciais Maiúsculas em Cada Palavra Importante (substantivos, adjetivos). Ex: "Vestido Feminino Longo Estampado Manga Bufante". Nunca escreva o título todo em minúsculas.
2. ESTRATÉGIA DE SEO (o mais importante): NÃO copie a descrição do vendedor. Você é um especialista - PENSE em como o cliente busca na Shopee e ENRIQUEÇA o título com palavras-chave de busca reais que o vendedor não escreveu. Ex: se ele diz "vestido de passaros", você pensa em termos como "Vestido Midi Floral Boho Chic Moda Feminina Verão" conforme o que realmente aparece. Adicione sinônimos e termos que ampliam o alcance (ex: "Roupa Feminina", "Moda", "Elegante", "Casual", conforme o produto).
3. Aproveite ao máximo os 100 caracteres - um título curto demais desperdiça espaço de busca. Busque usar entre 70 e 100 caracteres.
4. Comece pelo tipo de produto + característica principal, depois vá agregando palavras-chave estratégicas.
5. PROIBIDO: cores (amarelo, rosa, lilás, azul...) e tamanhos (P, M, G, GG). NUNCA inclua cor nem tamanho.
6. Sem emojis, sem CAIXA ALTA total, sem símbolos.`
      : `REGRAS DO TÍTULO (Mercado Livre) - siga TODAS com rigor:
1. CAPITALIZAÇÃO: use Iniciais Maiúsculas nas Palavras Importantes. Nunca tudo minúsculo.
2. ESTRATÉGIA: não copie a descrição do vendedor. Pense como o cliente busca no Mercado Livre e use as palavras-chave mais fortes e diretas. O ML valoriza títulos objetivos e bem ranqueados.
3. Máximo 60 caracteres - respeite bem esse limite, priorizando os termos de maior busca.
4. Comece pelo termo principal que o cliente busca, seguido das características mais relevantes.
5. Sem emojis, sem CAIXA ALTA total, sem símbolos.`;

    // Regras de descrição específicas por marketplace
    const regraDescricao = marketplace === 'ml'
      ? `REGRAS DA DESCRIÇÃO (Mercado Livre):
- ATENÇÃO CRÍTICA: a descrição deve ser 100% TEXTO PURO. É TERMINANTEMENTE PROIBIDO usar qualquer emoji, qualquer ícone, qualquer código HTML ou qualquer símbolo especial. Use SOMENTE letras, números e pontuação comum (ponto, vírgula, hífen).
- Texto persuasivo, organizado e escaneável, com parágrafos.
- Comece com uma frase de impacto sobre o benefício principal, depois desenvolva características, usos e diferenciais.
- Linguagem simples e profissional, em português do Brasil.`
      : `REGRAS DA DESCRIÇÃO (Shopee):
- Texto persuasivo, organizado e escaneável.
- Comece com uma frase de impacto sobre o benefício principal, depois desenvolva características, usos e diferenciais.
- Linguagem simples e profissional, em português do Brasil.`;

    const systemPrompt = `Você é um ESTRATEGISTA sênior de SEO e copywriting para marketplaces brasileiros, especialista em ${nomeMk}. Seu trabalho NÃO é repetir o que o vendedor escreveu - é TRANSFORMAR a informação do produto em um anúncio otimizado, rico em palavras-chave de busca reais, que rankeia no topo e vende. Você conhece profundamente como o cliente pesquisa em cada plataforma e sempre agrega termos estratégicos que o vendedor não pensou. Copiar a descrição do vendedor é um ERRO GRAVE - você sempre eleva e enriquece.

Se uma imagem do produto for enviada, analise-a com atenção: identifique modelo, tipo de peça, detalhes visíveis (estampa, tecido aparente, acabamento) e use essas informações reais para deixar o anúncio mais fiel e preciso.

${regraTitulo}

${regraDescricao}

REGRAS DOS BULLET POINTS:
- Exatamente 5 destaques curtos, cada um começando com ✓.
- Foque em benefícios concretos (não repita o óbvio).
- Os bullets podem mencionar cores e tamanhos normalmente (a restrição de cor/tamanho vale só para o título da Shopee).

Responda SOMENTE com um JSON válido, sem texto antes ou depois, no formato:
{"titulo":"...","bullets":["✓ ...","✓ ...","✓ ...","✓ ...","✓ ..."],"descricao":"..."}`;

    // Monta o conteúdo do usuário (texto + imagem se houver)
    const textoUsuario = produto && produto.trim()
      ? `Crie o anúncio para ${nomeMk} deste produto:\n\n${produto}`
      : `Crie o anúncio para ${nomeMk} do produto mostrado na imagem.`;

    let userContent;
    if (imagem) {
      userContent = [
        { type: 'text', text: textoUsuario },
        { type: 'image_url', image_url: { url: imagem } }
      ];
    } else {
      userContent = textoUsuario;
    }

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + chave },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      })
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ erro: 'Erro na OpenAI: ' + err.slice(0, 200) });
    }

    const data = await r.json();
    const conteudo = data.choices?.[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(conteudo); } catch { return res.status(500).json({ erro: 'Resposta inválida da IA.' }); }

    return res.status(200).json({ ok: true, ...parsed, marketplace });
  } catch (e) {
    return res.status(500).json({ erro: 'Erro interno: ' + (e.message || 'desconhecido') });
  }
}
