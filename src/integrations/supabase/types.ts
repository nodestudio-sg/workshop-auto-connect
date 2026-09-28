export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      booking_requests: {
        Row: {
          confirmed_at: string | null
          confirmed_date: string | null
          confirmed_time: string | null
          created_at: string
          customer_id: string
          customer_notes: string | null
          estimate_total: number
          id: string
          idempotency_key: string | null
          preferred_date: string
          preferred_time: string
          price_snapshot: Json
          service_ids: Json
          status: string
          subtotal_cents: number | null
          tax_cents: number | null
          tax_rate: number | null
          total_cents: number | null
          vehicle_id: string
          workshop_id: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_date?: string | null
          confirmed_time?: string | null
          created_at?: string
          customer_id: string
          customer_notes?: string | null
          estimate_total?: number
          id?: string
          idempotency_key?: string | null
          preferred_date: string
          preferred_time: string
          price_snapshot?: Json
          service_ids?: Json
          status?: string
          subtotal_cents?: number | null
          tax_cents?: number | null
          tax_rate?: number | null
          total_cents?: number | null
          vehicle_id: string
          workshop_id: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_date?: string | null
          confirmed_time?: string | null
          created_at?: string
          customer_id?: string
          customer_notes?: string | null
          estimate_total?: number
          id?: string
          idempotency_key?: string | null
          preferred_date?: string
          preferred_time?: string
          price_snapshot?: Json
          service_ids?: Json
          status?: string
          subtotal_cents?: number | null
          tax_cents?: number | null
          tax_rate?: number | null
          total_cents?: number | null
          vehicle_id?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_customer_same_workshop_fkey"
            columns: ["customer_id", "workshop_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "workshop_id"]
          },
          {
            foreignKeyName: "booking_requests_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_vehicle_of_customer_fkey"
            columns: ["vehicle_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id", "customer_id"]
          },
          {
            foreignKeyName: "booking_requests_vehicle_same_workshop_fkey"
            columns: ["vehicle_id", "workshop_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id", "workshop_id"]
          },
          {
            foreignKeyName: "booking_requests_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          id: string
          mobile: string
          name: string
          user_id: string | null
          workshop_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mobile: string
          name: string
          user_id?: string | null
          workshop_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mobile?: string
          name?: string
          user_id?: string | null
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          created_at: string
          extra_work: Json | null
          id: string
          invoice_no: string | null
          is_active: boolean
          line_items: Json
          mileage_km: number | null
          paid: boolean
          photos: Json
          service_date: string
          stage_times: Json
          status: string
          title: string
          total: number
          vehicle_id: string
          workshop_id: string
        }
        Insert: {
          created_at?: string
          extra_work?: Json | null
          id?: string
          invoice_no?: string | null
          is_active?: boolean
          line_items?: Json
          mileage_km?: number | null
          paid?: boolean
          photos?: Json
          service_date?: string
          stage_times?: Json
          status?: string
          title: string
          total?: number
          vehicle_id: string
          workshop_id: string
        }
        Update: {
          created_at?: string
          extra_work?: Json | null
          id?: string
          invoice_no?: string | null
          is_active?: boolean
          line_items?: Json
          mileage_km?: number | null
          paid?: boolean
          photos?: Json
          service_date?: string
          stage_times?: Json
          status?: string
          title?: string
          total?: number
          vehicle_id?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_vehicle_same_workshop_fkey"
            columns: ["vehicle_id", "workshop_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id", "workshop_id"]
          },
          {
            foreignKeyName: "jobs_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          components: Json
          description: string | null
          id: string
          name: string
          price: number
          quote_after_inspection: boolean
          sort_order: number
          workshop_id: string
        }
        Insert: {
          components?: Json
          description?: string | null
          id?: string
          name: string
          price?: number
          quote_after_inspection?: boolean
          sort_order?: number
          workshop_id: string
        }
        Update: {
          components?: Json
          description?: string | null
          id?: string
          name?: string
          price?: number
          quote_after_inspection?: boolean
          sort_order?: number
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          make: string
          mileage_km: number
          model: string
          next_service_due_date: string | null
          next_service_due_km: number | null
          oil_filter: string | null
          oil_grade: string | null
          oil_litres: number | null
          plate: string
          workshop_id: string
          year: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          make: string
          mileage_km?: number
          model: string
          next_service_due_date?: string | null
          next_service_due_km?: number | null
          oil_filter?: string | null
          oil_grade?: string | null
          oil_litres?: number | null
          plate: string
          workshop_id: string
          year: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          make?: string
          mileage_km?: number
          model?: string
          next_service_due_date?: string | null
          next_service_due_km?: number | null
          oil_filter?: string | null
          oil_grade?: string | null
          oil_litres?: number | null
          plate?: string
          workshop_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_customer_same_workshop_fkey"
            columns: ["customer_id", "workshop_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "workshop_id"]
          },
          {
            foreignKeyName: "vehicles_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_slots: {
        Row: {
          available: boolean
          id: string
          slot_date: string
          slot_time: string
          workshop_id: string
        }
        Insert: {
          available?: boolean
          id?: string
          slot_date: string
          slot_time: string
          workshop_id: string
        }
        Update: {
          available?: boolean
          id?: string
          slot_date?: string
          slot_time?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_slots_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      workshops: {
        Row: {
          address: string
          brand_color: string
          created_at: string
          demo_mode: boolean
          id: string
          logo_url: string | null
          name: string
          phone: string
          slug: string
          tax_rate: number
        }
        Insert: {
          address: string
          brand_color?: string
          created_at?: string
          demo_mode?: boolean
          id?: string
          logo_url?: string | null
          name: string
          phone: string
          slug: string
          tax_rate?: number
        }
        Update: {
          address?: string
          brand_color?: string
          created_at?: string
          demo_mode?: boolean
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string
          slug?: string
          tax_rate?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_vehicle: {
        Args: {
          _make: string
          _mileage_km: number
          _model: string
          _plate: string
          _workshop_id: string
          _year: number
        }
        Returns: string
      }
      approve_extra_work: { Args: { _job_id: string }; Returns: undefined }
      link_customer: {
        Args: { _mobile: string; _slug: string }
        Returns: string
      }
      submit_booking_request:
        | {
            Args: {
              _customer_id: string
              _idempotency_key: string
              _preferred_date: string
              _preferred_time: string
              _service_ids: string[]
              _shown_total_cents: number
              _vehicle_id: string
              _workshop_id: string
            }
            Returns: string
          }
        | {
            Args: {
              _customer_id: string
              _idempotency_key: string
              _notes: string
              _preferred_date: string
              _preferred_time: string
              _service_ids: string[]
              _shown_total_cents: number
              _vehicle_id: string
              _workshop_id: string
            }
            Returns: string
          }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
