export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_codes: {
        Row: {
          agent_code: string
          created_at: string
          id: string
          is_used: boolean
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agent_code: string
          created_at?: string
          id?: string
          is_used?: boolean
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agent_code?: string
          created_at?: string
          id?: string
          is_used?: boolean
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_session_agents: {
        Row: {
          session_id: string
          user_id: string
        }
        Insert: {
          session_id: string
          user_id: string
        }
        Update: {
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_session_agents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "coaching_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_session_agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_session_attendance: {
        Row: {
          agent_email: string
          agent_id: string | null
          agent_name: string
          created_at: string
          group_id: string | null
          group_name: string | null
          id: string
          joined_at: string | null
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          agent_email: string
          agent_id?: string | null
          agent_name: string
          created_at?: string
          group_id?: string | null
          group_name?: string | null
          id?: string
          joined_at?: string | null
          session_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          agent_email?: string
          agent_id?: string | null
          agent_name?: string
          created_at?: string
          group_id?: string | null
          group_name?: string | null
          id?: string
          joined_at?: string | null
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_session_attendance_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_session_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "coaching_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_session_groups: {
        Row: {
          group_id: string
          session_id: string
        }
        Insert: {
          group_id: string
          session_id: string
        }
        Update: {
          group_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_session_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_session_groups_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "coaching_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_sessions: {
        Row: {
          coaching_type: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          created_by_role: string | null
          description: string | null
          end_date: string
          id: string
          link: string | null
          start_date: string
          status: string
          tenant_id: string
          title: string
          training_mode: string
          updated_at: string
        }
        Insert: {
          coaching_type: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          created_by_role?: string | null
          description?: string | null
          end_date: string
          id?: string
          link?: string | null
          start_date: string
          status?: string
          tenant_id: string
          title: string
          training_mode: string
          updated_at?: string
        }
        Update: {
          coaching_type?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          created_by_role?: string | null
          description?: string | null
          end_date?: string
          id?: string
          link?: string | null
          start_date?: string
          status?: string
          tenant_id?: string
          title?: string
          training_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_agents: {
        Row: {
          event_id: string
          user_id: string
        }
        Insert: {
          event_id: string
          user_id: string
        }
        Update: {
          event_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_agents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      event_groups: {
        Row: {
          event_id: string
          group_id: string
        }
        Insert: {
          event_id: string
          group_id: string
        }
        Update: {
          event_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_groups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_role: string | null
          description: string | null
          end_date: string | null
          event_title: string
          id: string
          meeting_link: string | null
          start_date: string
          status: string
          tenant_id: string
          type: string
          updated_at: string
          venue: string | null
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_role?: string | null
          description?: string | null
          end_date?: string | null
          event_title: string
          id?: string
          meeting_link?: string | null
          start_date: string
          status?: string
          tenant_id: string
          type: string
          updated_at?: string
          venue?: string | null
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_role?: string | null
          description?: string | null
          end_date?: string | null
          event_title?: string
          id?: string
          meeting_link?: string | null
          start_date?: string
          status?: string
          tenant_id?: string
          type?: string
          updated_at?: string
          venue?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      group_trainers: {
        Row: {
          created_at: string
          group_id: string
          trainer_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          trainer_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_trainers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_trainers_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          id: string
          leader_id: string | null
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          leader_id?: string | null
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          leader_id?: string | null
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      point_activity_types: {
        Row: {
          category: string
          label: string
          name: string
          subject_type: string
        }
        Insert: {
          category: string
          label: string
          name: string
          subject_type: string
        }
        Update: {
          category?: string
          label?: string
          name?: string
          subject_type?: string
        }
        Relationships: []
      }
      point_configs: {
        Row: {
          activity: string
          category: string
          created_at: string
          id: string
          points: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activity: string
          category: string
          created_at?: string
          id?: string
          points: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activity?: string
          category?: string
          created_at?: string
          id?: string
          points?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      point_transactions: {
        Row: {
          activity: string
          created_at: string
          id: string
          points: number
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          activity: string
          created_at?: string
          id?: string
          points: number
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          activity?: string
          created_at?: string
          id?: string
          points?: number
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prospects: {
        Row: {
          agent_id: string
          appointment_completed_at: string | null
          appointment_date: string | null
          appointment_end_time: string | null
          appointment_location: string | null
          appointment_start_time: string | null
          appointment_status: string | null
          created_at: string
          current_stage: string
          id: string
          products_sold: Json | null
          prospect_email: string | null
          prospect_entered_at: string
          prospect_name: string
          prospect_phone: string | null
          sales_completed_at: string | null
          sales_outcome: string | null
          sales_parts_completed: Json | null
          stage_history: Json
          tenant_id: string
          unsuccessful_reason: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          appointment_completed_at?: string | null
          appointment_date?: string | null
          appointment_end_time?: string | null
          appointment_location?: string | null
          appointment_start_time?: string | null
          appointment_status?: string | null
          created_at?: string
          current_stage?: string
          id?: string
          products_sold?: Json | null
          prospect_email?: string | null
          prospect_entered_at?: string
          prospect_name: string
          prospect_phone?: string | null
          sales_completed_at?: string | null
          sales_outcome?: string | null
          sales_parts_completed?: Json | null
          stage_history?: Json
          tenant_id: string
          unsuccessful_reason?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          appointment_completed_at?: string | null
          appointment_date?: string | null
          appointment_end_time?: string | null
          appointment_location?: string | null
          appointment_start_time?: string | null
          appointment_status?: string | null
          created_at?: string
          current_stage?: string
          id?: string
          products_sold?: Json | null
          prospect_email?: string | null
          prospect_entered_at?: string
          prospect_name?: string
          prospect_phone?: string | null
          sales_completed_at?: string | null
          sales_outcome?: string | null
          sales_parts_completed?: Json | null
          stage_history?: Json
          tenant_id?: string
          unsuccessful_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospects_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_jobs: {
        Row: {
          attempts: number
          batch_id: string | null
          created_at: string
          error_message: string | null
          file_name: string
          id: string
          reference: string
          report_month: number
          report_year: number
          result: Json | null
          status: string
          storage_path: string
          tenant_id: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          attempts?: number
          batch_id?: string | null
          created_at?: string
          error_message?: string | null
          file_name: string
          id?: string
          reference: string
          report_month: number
          report_year: number
          result?: Json | null
          status?: string
          storage_path: string
          tenant_id: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          attempts?: number
          batch_id?: string | null
          created_at?: string
          error_message?: string | null
          file_name?: string
          id?: string
          reference?: string
          report_month?: number
          report_year?: number
          result?: Json | null
          status?: string
          storage_path?: string
          tenant_id?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_jobs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "upload_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_report_mtd: {
        Row: {
          ace: number
          batch_id: string
          created_at: string
          id: string
          month: number
          noc: number
          tenant_id: string
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          ace?: number
          batch_id: string
          created_at?: string
          id?: string
          month: number
          noc?: number
          tenant_id: string
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          ace?: number
          batch_id?: string
          created_at?: string
          id?: string
          month?: number
          noc?: number
          tenant_id?: string
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_report_mtd_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "upload_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_report_mtd_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_report_mtd_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_report_ytd: {
        Row: {
          ace: number
          batch_id: string
          created_at: string
          fyc: number
          fyc_pct: number
          fyct: number
          fyct_pct: number
          id: string
          mdrt_shortage_fyc: number
          mdrt_shortage_fyct: number
          month: number
          noc: number
          tenant_id: string
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          ace?: number
          batch_id: string
          created_at?: string
          fyc?: number
          fyc_pct?: number
          fyct?: number
          fyct_pct?: number
          id?: string
          mdrt_shortage_fyc?: number
          mdrt_shortage_fyct?: number
          month: number
          noc?: number
          tenant_id: string
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          ace?: number
          batch_id?: string
          created_at?: string
          fyc?: number
          fyc_pct?: number
          fyct?: number
          fyct_pct?: number
          id?: string
          mdrt_shortage_fyc?: number
          mdrt_shortage_fyct?: number
          month?: number
          noc?: number
          tenant_id?: string
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_report_ytd_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "upload_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_report_ytd_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_report_ytd_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          status?: string
        }
        Relationships: []
      }
      upload_batches: {
        Row: {
          created_at: string
          file_name: string
          id: string
          month: number
          rows_loaded: number
          rows_skipped: number
          status: string
          tenant_id: string
          uploaded_by: string | null
          year: number
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          month: number
          rows_loaded?: number
          rows_skipped?: number
          status?: string
          tenant_id: string
          uploaded_by?: string | null
          year: number
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          month?: number
          rows_loaded?: number
          rows_skipped?: number
          status?: string
          tenant_id?: string
          uploaded_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "upload_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          agency: string | null
          agent_code: string | null
          created_at: string
          email: string
          group_id: string | null
          id: string
          location: string | null
          name: string
          phone: string | null
          role: string
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          agency?: string | null
          agent_code?: string | null
          created_at?: string
          email: string
          group_id?: string | null
          id: string
          location?: string | null
          name: string
          phone?: string | null
          role: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          agency?: string | null
          agent_code?: string | null
          created_at?: string
          email?: string
          group_id?: string | null
          id?: string
          location?: string | null
          name?: string
          phone?: string | null
          role?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      sales_report_mtd_fyc: {
        Row: {
          ace: number | null
          fyc_mtd: number | null
          fyct_mtd: number | null
          id: string | null
          month: number | null
          noc: number | null
          tenant_id: string | null
          user_id: string | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_report_mtd_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_report_mtd_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      get_agent_leaderboard: { Args: { p_tenant_id: string }; Returns: Json }
      get_agent_points_breakdown: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_tenant_id: string
          p_user_id: string
        }
        Returns: Json
      }
      get_agent_points_summary: {
        Args: { p_tenant_id: string; p_user_id: string }
        Returns: Json
      }
      get_agent_stats: {
        Args: { p_group_id: string; period_start: string }
        Returns: Json
      }
      get_dashboard_stats: {
        Args: { p_group_id?: string; period_start: string }
        Returns: Json
      }
      get_group_detail_stats: {
        Args: { p_group_id: string; period_start: string }
        Returns: Json
      }
      get_group_stats: { Args: never; Returns: Json }
      get_leaderboard_stats: {
        Args: { p_period_start: string; p_tenant_id: string }
        Returns: Json
      }
      reconcile_stale_report_jobs: { Args: never; Returns: undefined }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

