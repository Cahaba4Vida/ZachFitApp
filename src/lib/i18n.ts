const dict = {
  en: {
    login: 'Login',
    logout: 'Logout',
    home_logged_out: 'Login to start building your program.',
    home_title: 'Home',
    welcome: 'Welcome',
    ai_status: 'AI access',
    onboarding_required: 'You must complete onboarding before using the app.',
    onboarding_required_short: 'Onboarding required.',
    go_to_onboarding: 'Go to onboarding',
    go_today: 'Go to Today',
    settings: 'Settings',
    onboarding_title: 'Onboarding',
    onboarding_desc: 'Complete the steps below to unlock the app.',
    step_design_program: 'Design program',
    step_sign_forms: 'Sign forms',
    step_get_started: 'Get started',
    generate_program: 'Generate program (demo)',
    ai_pending_approval: 'AI pending approval',
    ai_locked_message:
      'AI is locked for new users right now. If you have an access code, redeem it:',
    have_code: 'Have an access code?',
    promo_code: 'Promo code',
    redeem: 'Redeem',
    sign_forms: 'Sign forms (demo)',
    forms_note:
      'In production, you will review and sign liability/terms; PDF is emailed to admin.',
    unlock_app: 'Unlock app',
    done: 'Done',
    today: 'Today',
    today_stub: 'This is a scaffold. Wire in program/day rendering next.',
    ai_features: 'AI features',
    enabled: 'Enabled',
    disabled: 'Disabled',
    open_chat_adjust: 'Chat to adjust (demo)',
    login_required: 'Login required.',
    no_access: 'No access.',
    inbox: 'Inbox',
    inbox_stub: 'Inbox scaffold.',
    language: 'Language',
    save: 'Save',
    custom_ai_instructions: 'Custom AI instructions',
    ai_instructions_note: 'These are preferences; safety rules always apply.'
  },
  es: {
    login: 'Iniciar sesion',
    logout: 'Cerrar sesion',
    home_logged_out: 'Inicia sesion para empezar.',
    home_title: 'Inicio',
    welcome: 'Bienvenido',
    ai_status: 'Acceso IA',
    onboarding_required: 'Debes completar el onboarding antes de usar la app.',
    onboarding_required_short: 'Onboarding requerido.',
    go_to_onboarding: 'Ir a onboarding',
    go_today: 'Ir a Hoy',
    settings: 'Ajustes',
    onboarding_title: 'Onboarding',
    onboarding_desc: 'Completa los pasos para desbloquear la app.',
    step_design_program: 'Disenar programa',
    step_sign_forms: 'Firmar formularios',
    step_get_started: 'Empezar',
    generate_program: 'Generar programa (demo)',
    ai_pending_approval: 'IA pendiente de aprobacion',
    ai_locked_message:
      'La IA esta bloqueada para usuarios nuevos. Si tienes un codigo, canjealo:',
    have_code: 'Tienes un codigo?',
    promo_code: 'Codigo',
    redeem: 'Canjear',
    sign_forms: 'Firmar (demo)',
    forms_note:
      'En produccion: formularios legales; el PDF se envia al admin.',
    unlock_app: 'Desbloquear',
    done: 'Listo',
    today: 'Hoy',
    today_stub: 'Estructura base. Conecta la vista del programa despues.',
    ai_features: 'Funciones IA',
    enabled: 'Activado',
    disabled: 'Desactivado',
    open_chat_adjust: 'Chat para ajustar (demo)',
    login_required: 'Requiere iniciar sesion.',
    no_access: 'Sin acceso.',
    inbox: 'Buzon',
    inbox_stub: 'Estructura del buzon.',
    language: 'Idioma',
    save: 'Guardar',
    custom_ai_instructions: 'Instrucciones IA personalizadas',
    ai_instructions_note: 'Preferencias; las reglas de seguridad siempre aplican.'
  }
} as const;

let lang: 'en' | 'es' = 'en';

export function setLang(l: 'en' | 'es') {
  lang = l;
}

export function t(key: keyof typeof dict.en) {
  return (dict as any)[lang][key] ?? dict.en[key];
}
