export type Role = 'user' | 'coach' | 'admin' | 'super_admin';

export type MeResponse = {
  user: { id: string; email: string; role: Role; created_at: string };
  settings: {
    language: 'en' | 'es';
    units: 'kg' | 'lb';
    intensity_style: 'rpe' | 'percent' | 'none';
    auto_adjust_mode: 'today_only' | 'auto_adjust';
    analytics_horizon: '12mo' | 'lifetime';
    ai_user_instructions?: string | null;
  };
  onboarding: {
    program_created: boolean;
    forms_signed_all: boolean;
    forms_due_at?: string;
    forms_required_now?: boolean;
    is_unlocked: boolean;
  };
  entitlements: {
    can_use_ai: boolean;
    can_generate_program: boolean;
    can_adjust_future: boolean;
    free_cycles_remaining: number;
  };
  growth_mode: 'free_flow' | 'limited_flow';
  ai_status: 'grandfathered' | 'approved' | 'pending' | 'promo_bypass';
};
