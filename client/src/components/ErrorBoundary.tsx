/*
 * ErrorBoundary — V19.6
 * Detecta el NotFoundError de insertBefore causado por traductores automáticos
 * y muestra un mensaje amigable en español con auto-recarga.
 */
import { AlertTriangle, RotateCcw, Languages } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  isTranslationError: boolean;
  error: Error | null;
}

// Detecta si el error es causado por un traductor automático modificando el DOM
function isTranslatorError(error: Error): boolean {
  const msg = error?.message || '';
  const stack = error?.stack || '';
  return (
    msg.includes('insertBefore') ||
    msg.includes('removeChild') ||
    msg.includes('NotFoundError') ||
    stack.includes('insertBefore') ||
    stack.includes('removeChild')
  );
}

class ErrorBoundary extends Component<Props, State> {
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, isTranslationError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      isTranslationError: isTranslatorError(error),
      error,
    };
  }

  componentDidUpdate(_: Props, prevState: State) {
    // Auto-recarga silenciosa en 3s si es error de traductor
    if (this.state.hasError && this.state.isTranslationError && !prevState.hasError) {
      this.reloadTimer = setTimeout(() => window.location.reload(), 3000);
    }
  }

  componentWillUnmount() {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.state.isTranslationError) {
      // Error de traductor automático — mensaje amigable
      return (
        <div
          style={{
            minHeight: '100vh',
            backgroundColor: '#FFF8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            fontFamily: "'Nunito', sans-serif",
          }}
        >
          <div style={{ maxWidth: '360px', textAlign: 'center' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: '#FEF3C7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem',
              }}
            >
              <Languages size={28} color="#D97706" />
            </div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#92400E', marginBottom: '0.75rem' }}>
              Desactivá la traducción automática
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#78350F', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              Tu navegador está traduciendo la app y eso causa un conflicto.
              Por favor <strong>desactivá la traducción automática</strong> y recargá la página.
            </p>
            <p style={{ fontSize: '0.75rem', color: '#B45309', marginBottom: '1.5rem' }}>
              Recargando automáticamente en 3 segundos…
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.75rem',
                backgroundColor: '#D97706',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.875rem',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={16} />
              Recargar ahora
            </button>
          </div>
        </div>
      );
    }

    // Error genérico
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#FFF8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: "'Nunito', sans-serif",
        }}
      >
        <div style={{ maxWidth: '400px', textAlign: 'center' }}>
          <AlertTriangle size={48} color="#DC2626" style={{ margin: '0 auto 1rem' }} />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a2e', marginBottom: '0.5rem' }}>
            Ocurrió un error inesperado
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '1.5rem' }}>
            {this.state.error?.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.75rem',
              backgroundColor: '#D97706',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.875rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={16} />
            Recargar página
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
