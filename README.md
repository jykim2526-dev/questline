# QUESTLINE

할 일을 퀘스트로 바꿔 주는 게임형 플래너. 기록은 각자 브라우저에 저장되고, AI 기능(퀘스트 마스터)은 Cloudflare Worker를 거쳐 Claude API를 불러요.

```
index.html        앱 (GitHub Pages가 그대로 보여 줌)
config.js         Worker 주소 한 줄
worker/           API 키를 숨겨 두는 프록시 (Cloudflare Worker)
```

API 키는 GitHub에 절대 올리지 않아요. 키는 Cloudflare의 Secret에만 들어가요.

---

## 설정 순서 (30분 정도)

### 1. Anthropic Console: 키 만들기와 사용 한도 걸기

1. https://platform.claude.com 에 로그인한 뒤 **API Keys → Create Key**를 누르고 이름을 `questline`으로 정해요. 키는 한 번만 보이니까 잠깐 메모장에 복사해 두세요.
2. **Limits**(또는 Billing)에서 **월 사용 한도(spend limit)**를 걸어요. 처음에는 $20 정도면 충분해요.
3. 크레딧에 **만료일**이 있는지 Billing에서 확인해 두세요.

### 2. GitHub: 저장소 만들고 파일 올리기

1. GitHub에서 **New repository**를 누르고 이름을 `questline`으로, 공개 범위를 **Public**으로 정해요. 무료 계정은 Public이어야 Pages를 쓸 수 있어요.
2. **Add file → Upload files**를 누르고 이 폴더 안의 파일을 전부 끌어다 놓아요(`worker` 폴더 포함). 그다음 **Commit changes**를 눌러요.
3. `worker/wrangler.toml`을 열고 연필 아이콘으로 수정해요.
   ```toml
   ALLOWED_ORIGIN = "https://내아이디.github.io"
   ```
   `/questline` 같은 뒤쪽 경로와 끝의 `/`는 빼요.
4. **Settings → Pages**에서 Source를 **Deploy from a branch**로, Branch를 **main / (root)**로 고르고 **Save**를 눌러요.
   1~2분 뒤 `https://내아이디.github.io/questline/` 에서 앱이 열려요. 이때는 아직 AI 기능이 꺼져 있어요.

### 3. Cloudflare: Worker 배포하기

1. https://dash.cloudflare.com 에 무료로 가입해요.
2. **Workers & Pages → Create → Import a repository**로 가서 GitHub를 연결하고 `questline` 저장소를 골라요.
3. 설정 화면에서 다음처럼 입력해요.
   - **Project name**: `questline-api`. `wrangler.toml`의 `name`과 똑같아야 해요.
   - **Root directory**: `worker`
   - **Build command**: `npm install`
   - **Deploy command**: `npx wrangler deploy`
4. **Deploy**를 누르면 `https://questline-api.<내서브도메인>.workers.dev` 주소가 생겨요.
5. 만든 Worker의 **Settings → Variables and Secrets → Add**에서 아래 두 개를 **Secret** 타입으로 넣어요.

   | 이름 | 값 |
   |---|---|
   | `ANTHROPIC_API_KEY` | 1단계에서 만든 키 |
   | `ACCESS_CODE` | 친구에게 알려 줄 연결 코드. 12자 이상으로 길게, 직접 지어서 넣어요. |

   메모장에 복사해 둔 API 키는 이제 지워도 돼요.

### 4. 앱과 Worker 잇기

1. GitHub에서 `config.js`를 열어 수정해요.
   ```js
   window.QUESTLINE_API = "https://questline-api.<내서브도메인>.workers.dev";
   ```
2. 커밋하고 1~2분 기다린 뒤 Pages 주소를 새로고침해요.
3. 앱의 **설정**에 **퀘스트 마스터 연결 코드** 칸이 생겨요. `ACCESS_CODE`를 넣고 저장해요.
4. 장기 목표에서 **퀘스트 마스터에게 달별로 쪼개기**를 눌러서 제안이 나오면 연결된 거예요.

### 5. 친구에게 보내기

Pages 주소와 연결 코드를 **따로따로** 보내요. 친구 기록은 친구 브라우저에만 저장되고, 서로의 기록은 보이지 않아요.

---

## 문제가 생기면

| 앱에 뜨는 말 | 원인 |
|---|---|
| 연결 코드가 맞지 않아요 | 설정에 넣은 코드가 `ACCESS_CODE`와 달라요. |
| 서버에 연결하지 못했어요 | `config.js` 주소가 틀렸거나, `ALLOWED_ORIGIN`이 Pages 주소와 달라요. |
| 답을 받지 못했어요 | Cloudflare에서 Worker → **Logs**를 보세요. 키 오류, 크레딧 부족, 한도 초과가 여기 찍혀요. |

연결 코드가 새어 나간 것 같으면 Cloudflare에서 `ACCESS_CODE` 값만 바꾸면 돼요. 기존 코드는 바로 막혀요.

## 비용

모델은 Claude Opus 5.5예요(입력 100만 토큰당 $4, 출력 100만 토큰당 $20). 쪼개기 한 번에 약 $0.05~0.15, 긴 문서를 넣은 계획 짜기 한 번에 약 $0.2~0.4가 들어요. 요청 하나가 아무리 커도 Worker가 약 $0.6 안쪽으로 막아요. AI를 쓰는 건 계획을 짤 때뿐이고, 퀘스트 완료나 경험치는 비용이 들지 않아요.
