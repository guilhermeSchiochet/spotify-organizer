# Organizador de Curtidas

Separa as suas "Músicas Curtidas" do Spotify em playlists: por gênero, gênero detalhado, artista, década, ano de lançamento ou ano em que você curtiu.

## Como usar

1. Dê dois cliques em **`Abrir Organizador.bat`**. Uma janela preta abre e o navegador vai para `http://127.0.0.1:8888/`. Deixe a janela aberta enquanto usa o site.
2. **Só na primeira vez:** siga as instruções da tela para criar um app no [painel do Spotify](https://developer.spotify.com/dashboard):
   - Redirect URI: `http://127.0.0.1:8888/`
   - API: **Web API**
   - Copie o **Client ID** e cole no site.
3. Clique em **Conectar com Spotify** e autorize.
4. Escolha o critério → **Gerar sugestões** → revise (renomeie, desmarque, junte grupos, tire músicas) → **Criar playlists**.

## Bom saber

- Nada é apagado das suas curtidas: o site só **cria** playlists e **adiciona** músicas nelas.
- Pode rodar de novo no futuro: com a opção "só adicionar as músicas que faltam" marcada, as playlists que já existem são atualizadas em vez de duplicadas.
- **Como o gênero é descoberto:** o Spotify quase não informa mais gêneros para apps em modo de desenvolvimento, então o site pesquisa cada artista fora dele:
  1. **Deezer**: encontra o artista pela própria música que você curtiu, faz uma votação com os gêneros de todos os álbuns dele e ainda considera o álbum exato de cada música. É a fonte que melhor conhece música brasileira (sertanejo, funk, pagode, forró, gospel…).
  2. **MusicBrainz**: tags da comunidade, usadas quando o Deezer não conhece o artista ou fica em dúvida (por exemplo, "Pop" genérico).
  Na primeira vez isso leva de alguns segundos a alguns minutos, dependendo de quantos artistas você tem. Depois fica salvo e as próximas vezes são instantâneas.
- Só nomes de artistas e músicas são enviados ao Deezer e ao MusicBrainz, nunca seus dados de login.
- O que ninguém souber classificar fica em "Sem gênero identificado".
- Regras do Spotify para apps em modo de desenvolvimento: o dono do app precisa ter **Premium**, e só você e até 5 contas cadastradas em *User Management* conseguem usar.
- Tudo roda no seu navegador; o token de acesso fica guardado só nele. Use **Sair** para apagá-lo.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html`, `style.css`, `app.js` | O site |
| `servidor.ps1` | Servidor local mínimo (usa o PowerShell do Windows, não precisa instalar nada) |
| `Abrir Organizador.bat` | Atalho que inicia o servidor e abre o navegador |
