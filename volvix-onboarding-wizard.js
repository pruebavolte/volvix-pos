/**
 * VOLVIX ONBOARDING WIZARD
 * Etapa 3 del journey del usuario nuevo
 *
 * Muestra un wizard de primeros pasos SOLO en el primer login.
 * 4 pasos: Bienvenida → Agregar producto → Inventario → Primera venta
 * Dismissable, no reaparece (guardado en localStorage).
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'volvix_onboarding_completed';

  // Esperar a que el DOM esté listo + auth-gate se complete
  function checkAndShowOnboarding() {
    if (localStorage.getItem(STORAGE_KEY)) {
      return; // Ya completado, no mostrar
    }

    // Crear el HTML del wizard
    const wizardHTML = `
      <div id="volvix-onboarding-overlay" class="onboarding-overlay">
        <div class="onboarding-modal">
          <!-- Paso 1: Bienvenida -->
          <div class="onboarding-step active" data-step="1">
            <div class="onboarding-header">
              <h2>🚀 Bienvenido a SalvadoreX</h2>
              <p>Vamos a configurar tu negocio en 4 pasos</p>
            </div>
            <div class="onboarding-content">
              <div class="step-icon">👋</div>
              <h3>Paso 1 de 4: Bienvenida</h3>
              <p>Te guiaremos para crear tu primer producto y realizar tu primera venta.</p>
              <ul class="onboarding-list">
                <li>✅ Agregar tu primer producto</li>
                <li>✅ Configurar inventario</li>
                <li>✅ Realizar tu primera venta</li>
                <li>✅ Ver reportes</li>
              </ul>
            </div>
            <div class="onboarding-actions">
              <button class="btn-secondary" onclick="volvixOnboarding.skip()">Omitir</button>
              <button class="btn-primary" onclick="volvixOnboarding.next()">Siguiente →</button>
            </div>
          </div>

          <!-- Paso 2: Agregar Producto -->
          <div class="onboarding-step" data-step="2">
            <div class="onboarding-header">
              <h2>📦 Agregar tu primer producto</h2>
              <p>Sin productos no hay ventas</p>
            </div>
            <div class="onboarding-content">
              <div class="step-icon">📦</div>
              <h3>Paso 2 de 4: Crear Producto</h3>
              <ol class="onboarding-steps">
                <li>Haz clic en <strong>"Inventario"</strong> en el menú</li>
                <li>Busca el botón <strong>"+ Agregar"</strong></li>
                <li>Rellena: Nombre, Precio, Categoría</li>
                <li>Haz clic en <strong>"Guardar"</strong></li>
              </ol>
              <div class="onboarding-hint">💡 Tip: El código de barras se puede rellenar después</div>
            </div>
            <div class="onboarding-actions">
              <button class="btn-secondary" onclick="volvixOnboarding.prev()">← Atrás</button>
              <button class="btn-primary" onclick="volvixOnboarding.next()">Siguiente →</button>
            </div>
          </div>

          <!-- Paso 3: Inventario -->
          <div class="onboarding-step" data-step="3">
            <div class="onboarding-header">
              <h2>📊 Configurar inventario</h2>
              <p>Cuántos tienes en stock</p>
            </div>
            <div class="onboarding-content">
              <div class="step-icon">📊</div>
              <h3>Paso 3 de 4: Stock Inicial</h3>
              <ol class="onboarding-steps">
                <li>En <strong>"Inventario"</strong>, abre tu producto recién creado</li>
                <li>Ingresa <strong>"Cantidad actual"</strong> (cuántas unidades tienes HOY)</li>
                <li>Opcional: Configura <strong>"Stock mínimo"</strong> para alertas</li>
                <li>Haz clic en <strong>"Guardar"</strong></li>
              </ol>
              <div class="onboarding-hint">💡 Tip: El stock se descuenta automáticamente al vender</div>
            </div>
            <div class="onboarding-actions">
              <button class="btn-secondary" onclick="volvixOnboarding.prev()">← Atrás</button>
              <button class="btn-primary" onclick="volvixOnboarding.next()">Siguiente →</button>
            </div>
          </div>

          <!-- Paso 4: Primera Venta -->
          <div class="onboarding-step" data-step="4">
            <div class="onboarding-header">
              <h2>💰 Tu primera venta</h2>
              <p>¡Es hora de vender!</p>
            </div>
            <div class="onboarding-content">
              <div class="step-icon">💰</div>
              <h3>Paso 4 de 4: Realizar Venta</h3>
              <ol class="onboarding-steps">
                <li>En el menú, haz clic en <strong>"Vender"</strong> (Vista ①)</li>
                <li>Busca tu producto en el buscador</li>
                <li>Haz clic para agregarlo al carrito</li>
                <li>Ingresa cantidad (si vende más de 1)</li>
                <li>Haz clic en <strong>"Cobrar"</strong> (botón azul grande)</li>
                <li>Ingresa el monto recibido y confirma</li>
              </ol>
              <div class="onboarding-hint">💡 Tip: El ticket se genera automáticamente</div>
            </div>
            <div class="onboarding-actions">
              <button class="btn-secondary" onclick="volvixOnboarding.prev()">← Atrás</button>
              <button class="btn-success" onclick="volvixOnboarding.complete()">✅ Entendido</button>
            </div>
          </div>

          <!-- Indicador de progreso -->
          <div class="onboarding-progress">
            <div class="progress-dots">
              <span class="dot active" onclick="volvixOnboarding.goTo(1)"></span>
              <span class="dot" onclick="volvixOnboarding.goTo(2)"></span>
              <span class="dot" onclick="volvixOnboarding.goTo(3)"></span>
              <span class="dot" onclick="volvixOnboarding.goTo(4)"></span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Inyectar en el DOM
    const container = document.createElement('div');
    container.innerHTML = wizardHTML;
    document.body.appendChild(container.firstElementChild);

    // Inyectar CSS si no existe
    if (!document.getElementById('volvix-onboarding-css')) {
      const style = document.createElement('style');
      style.id = 'volvix-onboarding-css';
      style.textContent = `
        .onboarding-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          backdrop-filter: blur(2px);
        }

        .onboarding-modal {
          background: white;
          border-radius: 12px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          width: 90%;
          max-width: 500px;
          max-height: 80vh;
          overflow-y: auto;
          position: relative;
        }

        .onboarding-step {
          display: none;
          padding: 32px 28px;
          animation: slideIn 0.3s ease;
        }

        .onboarding-step.active {
          display: block;
        }

        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .onboarding-header {
          text-align: center;
          margin-bottom: 24px;
        }

        .onboarding-header h2 {
          font-size: 22px;
          font-weight: 700;
          color: #1F2937;
          margin: 0 0 6px;
        }

        .onboarding-header p {
          font-size: 13px;
          color: #6B7280;
          margin: 0;
        }

        .onboarding-content {
          margin-bottom: 28px;
        }

        .step-icon {
          font-size: 48px;
          text-align: center;
          margin-bottom: 16px;
        }

        .onboarding-content h3 {
          font-size: 16px;
          font-weight: 600;
          color: #1F2937;
          margin: 0 0 12px;
        }

        .onboarding-content p {
          font-size: 13px;
          color: #374151;
          line-height: 1.6;
          margin: 0 0 12px;
        }

        .onboarding-list {
          list-style: none;
          padding: 0;
          margin: 12px 0;
        }

        .onboarding-list li {
          font-size: 13px;
          color: #374151;
          padding: 6px 0;
          margin-left: 12px;
        }

        .onboarding-steps {
          list-style: decimal;
          padding-left: 20px;
          margin: 12px 0;
        }

        .onboarding-steps li {
          font-size: 13px;
          color: #374151;
          padding: 6px 0;
          line-height: 1.6;
        }

        .onboarding-steps strong {
          color: #1F2937;
          font-weight: 600;
        }

        .onboarding-hint {
          background: #FEF3C7;
          border-left: 3px solid #F59E0B;
          padding: 10px 12px;
          border-radius: 4px;
          font-size: 12px;
          color: #78350F;
          margin: 12px 0 0;
        }

        .onboarding-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 20px;
        }

        .btn-primary, .btn-secondary, .btn-success {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary {
          background: #3B82F6;
          color: white;
        }

        .btn-primary:hover {
          background: #2563EB;
          transform: translateY(-1px);
        }

        .btn-secondary {
          background: #E5E7EB;
          color: #374151;
        }

        .btn-secondary:hover {
          background: #D1D5DB;
        }

        .btn-success {
          background: #10B981;
          color: white;
        }

        .btn-success:hover {
          background: #059669;
          transform: translateY(-1px);
        }

        .onboarding-progress {
          padding: 16px 0;
          text-align: center;
          border-top: 1px solid #E5E7EB;
        }

        .progress-dots {
          display: flex;
          gap: 8px;
          justify-content: center;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #D1D5DB;
          cursor: pointer;
          transition: all 0.2s;
        }

        .dot.active {
          background: #3B82F6;
          width: 24px;
          border-radius: 4px;
        }

        .dot:hover {
          background: #9CA3AF;
        }
      `;
      document.head.appendChild(style);
    }
  }

  // Esperar a que el DOM esté completamente listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndShowOnboarding);
  } else {
    // DOM ya está listo
    checkAndShowOnboarding();
  }

  // Objeto global para manejar el wizard
  window.volvixOnboarding = {
    currentStep: 1,
    totalSteps: 4,

    next() {
      if (this.currentStep < this.totalSteps) {
        this.goTo(this.currentStep + 1);
      }
    },

    prev() {
      if (this.currentStep > 1) {
        this.goTo(this.currentStep - 1);
      }
    },

    goTo(step) {
      if (step < 1 || step > this.totalSteps) return;

      // Ocultar paso actual
      const current = document.querySelector(`.onboarding-step[data-step="${this.currentStep}"]`);
      if (current) current.classList.remove('active');

      // Actualizar dot de progreso
      document.querySelectorAll('.dot').forEach((d, i) => {
        d.classList.toggle('active', i === step - 1);
      });

      // Mostrar nuevo paso
      this.currentStep = step;
      const next = document.querySelector(`.onboarding-step[data-step="${step}"]`);
      if (next) next.classList.add('active');
    },

    skip() {
      this.complete();
    },

    complete() {
      localStorage.setItem(STORAGE_KEY, 'true');
      const overlay = document.getElementById('volvix-onboarding-overlay');
      if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s ease';
        setTimeout(() => overlay.remove(), 300);
      }
    }
  };
})();
