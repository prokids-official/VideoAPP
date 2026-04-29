export default function ConfirmedPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        margin: 0,
        background: '#0a0a0b',
        color: '#f5f5f7',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <section style={{ width: 'min(520px, calc(100vw - 32px))' }}>
        <p style={{ color: '#9b7cff', fontSize: 13, marginBottom: 12 }}>FableGlitch Studio</p>
        <h1 style={{ fontSize: 28, margin: '0 0 12px' }}>邮箱已验证</h1>
        <p style={{ color: '#a1a1a8', lineHeight: 1.7 }}>
          你现在可以回到桌面 App，用刚才注册的邮箱和密码登录。
        </p>
      </section>
    </main>
  );
}
