# ♪ Organizador de Curtidas

Um site que separa as suas **Músicas Curtidas** do Spotify em playlists organizadas, por gênero, artista, década, ano de lançamento ou pelo ano em que você curtiu cada música.

Quem curte muita música no Spotify acaba com uma lista gigante e misturada. A ideia aqui é transformar essa lista em várias playlists menores e com sentido, sem precisar arrastar música por música.

## Por que existe

O Spotify não tem um jeito nativo de dividir as curtidas em playlists. Os sites que faziam isso pararam de funcionar ou passaram a pedir acesso à sua conta num servidor de terceiros.

O Organizador de Curtidas foi feito para:

- **Rodar só no seu computador.** Não tem servidor, banco de dados nem conta para criar. O site conversa direto do seu navegador com o Spotify.
- **Nunca apagar nada.** Ele só cria playlists e adiciona músicas nelas. Suas curtidas continuam do jeito que estão.
- **Entender música brasileira.** Sertanejo, funk, pagode, forró, MPB, gospel e axé aparecem como categorias próprias, e não jogados em "Pop" ou "World Music".
- **Deixar você decidir.** Antes de criar qualquer coisa, você revisa as sugestões: renomeia, desmarca, junta grupos e tira músicas.

## Como funciona

```
Suas curtidas ──► Agrupamento ──► Revisão ──► Playlists no Spotify
  (Spotify)        (critério)      (você)       (criadas ou atualizadas)
```

1. **Login.** Você conecta sua conta do Spotify pelo fluxo oficial de autorização (OAuth com PKCE). O site recebe um token de acesso, que fica guardado só no seu navegador.
2. **Leitura das curtidas.** O site baixa a lista das suas músicas curtidas e guarda uma cópia enxuta no navegador. Assim, da próxima vez não precisa baixar tudo de novo.
3. **Agrupamento.** Você escolhe um critério:

   | Critério | Exemplo de playlist |
   |---|---|
   | Gênero | Sertanejo, Hip Hop & Rap, Rock, MPB & Bossa Nova |
   | Gênero detalhado | Indie Rock Brasileiro, Funk Carioca |
   | Artista | Uma playlist por artista |
   | Década de lançamento | Anos 80, Anos 90, Anos 2000 |
   | Ano de lançamento | 1999, 2014, 2023 |
   | Ano em que curti | Curtidas de 2019, Curtidas de 2024 |

   Dá para definir um mínimo de músicas por playlist, juntar os grupos pequenos em "Outros" e colocar um prefixo no nome (ex.: `❤ Rock`).
4. **Revisão.** O site mostra as playlists sugeridas com capas e contagem de músicas. Você pode renomear, desmarcar, juntar dois grupos ou tirar músicas específicas.
5. **Criação.** As playlists são criadas na sua conta. Se você rodar de novo no futuro com a opção "só adicionar as músicas que faltam", as playlists que já existem são atualizadas em vez de duplicadas.

### Como o gênero é descoberto

Para apps em modo de desenvolvimento, o Spotify quase não informa mais o gênero dos artistas. Por isso o site consulta três fontes, da melhor para a pior:

1. **Spotify:** usado quando ainda devolve gêneros. Se vier vazio para os primeiros 30 artistas, o site para de perguntar.
2. **[Deezer](https://developers.deezer.com/api):** encontra o artista pela própria música que você curtiu (para não confundir artistas com o mesmo nome) e faz uma votação com os gêneros de todos os álbuns dele. Também identifica o gênero do álbum exato de cada música. É a fonte que melhor conhece música brasileira.
3. **[MusicBrainz](https://musicbrainz.org/):** tags da comunidade, usadas quando o Deezer não conhece o artista ou fica em dúvida (um "Pop" genérico ou um empate apertado, por exemplo).

As pistas de cada fonte recebem pesos e são convertidas em cerca de 25 categorias amplas (Sertanejo, Funk BR, Pagode & Samba, Metal, Eletrônica, K-Pop etc.). Algumas correções são aplicadas: "funk" de artista brasileiro vira funk carioca, e não funk americano.

Na primeira vez, essa busca leva de alguns segundos a alguns minutos, dependendo de quantos artistas você tem. O resultado fica salvo no navegador, e as próximas vezes são instantâneas. O que nenhuma fonte souber classificar vai para "Sem gênero identificado".

## Como usar

### O que você precisa

- Uma conta do Spotify. O dono do app precisa ter **Premium** (regra do Spotify para apps em modo de desenvolvimento).
- Um navegador moderno (Chrome, Edge, Firefox).
- **No Windows:** nada além disso. O servidor local usa o PowerShell que já vem no sistema.
- **No macOS ou Linux:** qualquer servidor de arquivos estáticos, como o Python.

### 1. Baixe o projeto

Clone o repositório ou baixe o ZIP (botão **Code → Download ZIP**) e extraia numa pasta.

### 2. Abra o site

**Windows:** dê dois cliques em `Abrir Organizador.bat`. Uma janela do PowerShell abre e o navegador vai para `http://127.0.0.1:8888/`. Deixe essa janela aberta enquanto usa o site.

**macOS ou Linux:** na pasta do projeto, rode:

```bash
python3 -m http.server 8888 --bind 127.0.0.1
```

Depois acesse `http://127.0.0.1:8888/`.

> O endereço precisa ser `127.0.0.1`, e não `localhost`: o Spotify não aceita `localhost` como endereço de retorno. Abrir o `index.html` direto (dois cliques no arquivo) também não funciona, porque o Spotify não consegue voltar para um arquivo local.

### 3. Crie seu app no Spotify (só na primeira vez)

Cada pessoa usa o próprio app do Spotify, então nenhuma chave fica no código.

1. Abra o [painel de desenvolvedor do Spotify](https://developer.spotify.com/dashboard) e clique em **Create app**.
2. Preencha nome e descrição como quiser.
3. Em **Redirect URIs**, adicione exatamente `http://127.0.0.1:8888/` (com a `/` no final).
4. Em **Which API/SDKs are you planning to use?**, marque **Web API**.
5. Salve, copie o **Client ID** e cole no site.

No modo de desenvolvimento, o app funciona para o dono e para até 5 contas cadastradas em **User Management**. Para organizar as curtidas de outra pessoa, cadastre o e-mail do Spotify dela lá.

### 4. Organize

Clique em **Conectar com Spotify**, autorize, escolha o critério e clique em **Gerar sugestões**. Revise as playlists e clique em **Criar playlists**.

## Privacidade

- Não existe servidor do projeto. Tudo roda no seu navegador.
- Seu login é usado só com o próprio Spotify. O token fica no `localStorage` do navegador e é apagado quando você clica em **Sair**.
- Para descobrir gêneros, apenas **nomes de artistas e de músicas** são pesquisados no Deezer e no MusicBrainz. Nenhum dado da sua conta é enviado a eles.
- Permissões pedidas ao Spotify: ler suas curtidas, ler suas playlists e criar ou editar playlists.

## Estrutura do projeto

| Arquivo | O que é |
|---|---|
| `index.html` | A página: tela de configuração e as três etapas (critério, revisão e criação) |
| `style.css` | Visual do site |
| `app.js` | Toda a lógica: login PKCE, leitura das curtidas, busca de gêneros, agrupamento e criação das playlists |
| `servidor.ps1` | Servidor local mínimo em PowerShell que serve a pasta em `http://127.0.0.1:8888/` |
| `Abrir Organizador.bat` | Atalho do Windows que inicia o servidor e abre o navegador |
| `LEIA-ME.md` | Guia rápido de uso |

Não há dependências, build nem framework: é HTML, CSS e JavaScript puros.

## Problemas comuns

| Mensagem | O que fazer |
|---|---|
| "Invalid redirect URI" ou "Not matching configuration" | O endereço em **Redirect URIs** no painel do Spotify precisa ser idêntico a `http://127.0.0.1:8888/`. Se você cadastrou diferente, o site tem um campo para informar o endereço exato. |
| "O Spotify bloqueou o acesso (403)" | Confira se sua conta está em **User Management** no painel do app e se o dono do app tem Premium. |
| "Não consegui abrir a porta 8888" | O servidor provavelmente já está aberto em outra janela. Use essa ou feche-a antes. |
| Muitas músicas em "Sem gênero identificado" | Nenhuma das três fontes conhecia esses artistas. Use **Juntar com…** na revisão para colocá-las em outro grupo. |
