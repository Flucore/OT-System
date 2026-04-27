// Estado de cada paso del checklist de 39 puntos
export type DiagnosticStepStatus =
  | 'OK'
  | 'NO_CRITICO'
  | 'CRITICO'
  | 'PEDIDO_USUARIO'
  | 'NO_APLICA'

export interface DiagnosticStep {
  status: DiagnosticStepStatus
  details?: string[]          // checkboxes específicos del paso (ver diagnostic-config.ts en web)
  value?: number | number[]   // valores numéricos: MΩ, %, ángulos U/D/R/L
  comments?: string
}

// Estructura JSONB del campo diagnostic_data en la tabla tickets
// Los 39 pasos del formulario de inspección de Medplan
export interface DiagnosticData {
  step_01_exera_id: DiagnosticStep
  step_02_imagen_evis: DiagnosticStep
  step_03_cobertura_exterior: DiagnosticStep
  step_04_angulacion: DiagnosticStep
  step_05_freno_angulacion: DiagnosticStep
  step_06_botones_funcionales: DiagnosticStep
  step_07_canal_aspiracion: DiagnosticStep
  step_08_aislamiento_canal: DiagnosticStep      // value: MΩ
  step_09_resistencia_insertion: DiagnosticStep  // value: MΩ
  step_10_cubre_angulacion: DiagnosticStep
  step_11_punta_distal: DiagnosticStep
  step_12_lente_objetivo: DiagnosticStep
  step_13_lente_iluminacion: DiagnosticStep
  step_14_guias_angulacion: DiagnosticStep
  step_15_cables_angulacion: DiagnosticStep
  step_16_tubo_insertion: DiagnosticStep
  step_17_tubo_universal: DiagnosticStep
  step_18_cabezal_control: DiagnosticStep
  step_19_valvulas: DiagnosticStep
  step_20_resolucion: DiagnosticStep             // value: %
  step_21_color: DiagnosticStep
  step_22_brillo: DiagnosticStep
  step_23_wb_balance: DiagnosticStep             // value: %
  step_24_canal_irrigacion: DiagnosticStep
  step_25_canal_instrumental: DiagnosticStep
  step_26_canal_sucion_biopsia: DiagnosticStep
  step_27_fuente_luz: DiagnosticStep
  step_28_procesador: DiagnosticStep
  step_29_teclado: DiagnosticStep
  step_30_conectores: DiagnosticStep
  step_31_cables_perifericos: DiagnosticStep
  step_32_limpieza_interna: DiagnosticStep
  step_33_angulacion_mecanica: DiagnosticStep    // value: number[] [U, D, R, L]
  step_34_fugas_agua: DiagnosticStep
  step_35_prueba_presion: DiagnosticStep
  step_36_limpieza_desinfeccion: DiagnosticStep
  step_37_accesorios_incluidos: DiagnosticStep
  step_38_documentacion: DiagnosticStep
  step_39_reparacion_no_standard: DiagnosticStep

  _metadata: {
    form_version: string          // e.g. '1.0'
    completed_at: string | null   // ISO8601
    completed_by_tech_id: string | null
  }
}

// Versión parcial para guardado progresivo (auto-save)
export type PartialDiagnosticData = Partial<Omit<DiagnosticData, '_metadata'>> & {
  _metadata: DiagnosticData['_metadata']
}
