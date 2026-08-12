import './styles.css'

const root = document.querySelector<HTMLElement>('#root')
if (!root) throw new Error('렌더러 루트가 없습니다.')

root.innerHTML = `
  <section class="shell" aria-labelledby="title">
    <div class="mascot" aria-hidden="true">삼</div>
    <h1 id="title">삼한이 메신저</h1>
    <p>사내 메신저 셸이 준비되었습니다.</p>
    <small>채팅 연결과 로그인 연계는 다음 슬라이스에서 추가됩니다.</small>
  </section>
`
