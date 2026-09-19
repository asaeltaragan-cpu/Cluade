/**
 * Hand-authored types mirroring /supabase/migrations. Keep in sync manually,
 * or regenerate with `supabase gen types typescript` once the project is linked.
 */

export type AppRole = "admin" | "manager" | "agent";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          agent_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      user_roles: {
        Row: { id: string; user_id: string; role: AppRole; created_at: string };
        Insert: { id?: string; user_id: string; role: AppRole; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["user_roles"]["Row"]>;
      };
      imports: {
        Row: {
          id: string;
          file_name: string;
          uploaded_by: string | null;
          uploaded_by_name: string | null;
          row_count: number;
          latest_month: string | null;
          agents_count: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["imports"]["Row"]> & { file_name: string };
        Update: Partial<Database["public"]["Tables"]["imports"]["Row"]>;
      };
      sales_facts: {
        Row: {
          id: number;
          import_id: string;
          product: string;
          entity_id: string;
          customer: string | null;
          channel: string | null;
          agent: string;
          ym: string;
          qty: number;
        };
        Insert: Omit<Database["public"]["Tables"]["sales_facts"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["sales_facts"]["Row"]>;
      };
      targets: {
        Row: {
          id: string;
          agent: string;
          product: string;
          year: number;
          recommended_qty: number | null;
          target_qty: number;
          note: string | null;
          set_by: string | null;
          set_by_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["targets"]["Row"]> & {
          agent: string;
          product: string;
          year: number;
        };
        Update: Partial<Database["public"]["Tables"]["targets"]["Row"]>;
      };
      target_history: {
        Row: {
          id: string;
          target_id: string | null;
          agent: string;
          product: string;
          year: number;
          old_qty: number | null;
          new_qty: number | null;
          reason: string | null;
          changed_by: string | null;
          changed_by_name: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["target_history"]["Row"]> & {
          agent: string;
          product: string;
          year: number;
        };
        Update: Partial<Database["public"]["Tables"]["target_history"]["Row"]>;
      };
      work_items: {
        Row: {
          id: string;
          agent: string;
          entity_id: string;
          product: string;
          customer: string | null;
          status: string;
          agent_note: string | null;
          manager_note: string | null;
          task: string | null;
          owner: string | null;
          next_follow_up: string | null;
          handled_at: string | null;
          missing_in_latest: boolean;
          updated_by: string | null;
          updated_by_name: string | null;
          updated_at: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["work_items"]["Row"]> & {
          agent: string;
          entity_id: string;
          product: string;
        };
        Update: Partial<Database["public"]["Tables"]["work_items"]["Row"]>;
      };
      work_item_history: {
        Row: {
          id: string;
          work_item_id: string | null;
          agent: string;
          entity_id: string;
          product: string;
          customer: string | null;
          field: string;
          old_value: string | null;
          new_value: string | null;
          changed_by: string | null;
          changed_by_name: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["work_item_history"]["Row"]> & {
          agent: string;
          entity_id: string;
          product: string;
          field: string;
        };
        Update: Partial<Database["public"]["Tables"]["work_item_history"]["Row"]>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      has_role: { Args: { _user_id: string; _role: AppRole }; Returns: boolean };
      is_manager: { Args: { _user_id: string }; Returns: boolean };
      current_agent_name: { Args: Record<string, never>; Returns: string | null };
      sync_work_item_flags: { Args: { _import_id: string }; Returns: void };
    };
    Enums: { app_role: AppRole };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
