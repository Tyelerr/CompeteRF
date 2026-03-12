import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

interface DropdownOption {
  label: string;
  value: string;
}

interface DropdownProps {
  label?: string;
  placeholder?: string;
  options: DropdownOption[];
  value?: string;
  onSelect: (value: string) => void;
  error?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  compact?: boolean;
}

const isWeb = Platform.OS === "web";

// ── Web popover portal ────────────────────────────────────────────────────────
const WebPopover = ({
  anchorRef,
  options,
  value,
  searchable,
  searchPlaceholder,
  compact,
  onSelect,
  onClose,
}: {
  anchorRef: React.RefObject<any>;
  options: DropdownOption[];
  value?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  compact?: boolean;
  onSelect: (v: string) => void;
  onClose: () => void;
}) => {
  const [searchText, setSearchText] = useState("");
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    if (anchorRef.current) {
      const el = anchorRef.current as HTMLElement;
      const r = el.getBoundingClientRect();
      setRect({
        top: r.bottom + window.scrollY + 2,
        left: r.left + window.scrollX,
        width: r.width,
      });
    }
  }, []);

  const filtered =
    searchable && searchText.trim()
      ? options.filter((o) =>
          o.label.toLowerCase().includes(searchText.toLowerCase()),
        )
      : options;

  if (!rect) return null;

  const popoverStyle: React.CSSProperties = {
    position: "fixed",
    top: rect.top,
    left: rect.left,
    width: Math.max(rect.width, compact ? 180 : 220),
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    zIndex: 999999,
    maxHeight: 280,
    overflowY: "auto",
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
  };

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999998,
  };

  const optionStyle = (isSelected: boolean): React.CSSProperties => ({
    padding: compact ? "6px 10px" : "8px 12px",
    fontSize: compact ? 12 : 13,
    color: isSelected ? "#fff" : COLORS.text,
    backgroundColor: isSelected ? COLORS.primary : "transparent",
    cursor: "pointer",
    borderBottom: `1px solid ${COLORS.border}`,
  });

  if (typeof document === "undefined") return null;

  const content = (
    <>
      <div style={overlayStyle} onClick={onClose} />
      <div style={popoverStyle}>
        {searchable && (
          <input
            autoFocus
            type="text"
            placeholder={searchPlaceholder || "Search..."}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "7px 10px",
              backgroundColor: COLORS.background,
              border: "none",
              borderBottom: `1px solid ${COLORS.border}`,
              color: COLORS.text,
              fontSize: 12,
              outline: "none",
            }}
          />
        )}
        {filtered.map((item) => (
          <div
            key={item.value}
            style={optionStyle(item.value === value)}
            onMouseEnter={(e) => {
              if (item.value !== value)
                (e.currentTarget as HTMLDivElement).style.backgroundColor =
                  COLORS.background;
            }}
            onMouseLeave={(e) => {
              if (item.value !== value)
                (e.currentTarget as HTMLDivElement).style.backgroundColor =
                  "transparent";
            }}
            onClick={() => {
              onSelect(item.value);
              onClose();
            }}
          >
            {item.label}
          </div>
        ))}
        {filtered.length === 0 && (
          <div
            style={{ padding: "10px", color: COLORS.textMuted, fontSize: 12 }}
          >
            No results
          </div>
        )}
      </div>
    </>
  );

  const { createPortal } = require("react-dom");
  return createPortal(content, document.body);
};

// ── Main Dropdown ─────────────────────────────────────────────────────────────
export const Dropdown = ({
  label,
  placeholder = "Select...",
  options,
  value,
  onSelect,
  error,
  disabled = false,
  searchable = false,
  searchPlaceholder = "Search...",
  compact = false,
}: DropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const anchorRef = useRef<any>(null);
  const selectedOption = options.find((o) => o.value === value);

  const handlePress = () => {
    if (!disabled) setIsOpen(!isOpen);
  };

  // ── Web ───────────────────────────────────────────────────────────────────
  if (isWeb) {
    return (
      <View style={wStyles.container}>
        {label && <Text style={styles.label}>{label}</Text>}
        {/* @ts-ignore */}
        <TouchableOpacity
          ref={anchorRef}
          style={[
            wStyles.selector,
            compact && wStyles.selectorCompact,
            isOpen && wStyles.selectorOpen,
            error && wStyles.selectorError,
            disabled && wStyles.selectorDisabled,
          ]}
          onPress={handlePress}
          activeOpacity={disabled ? 1 : 0.7}
        >
          <Text
            style={[
              wStyles.selectorText,
              compact && wStyles.selectorTextCompact,
              !selectedOption && wStyles.placeholder,
              disabled && wStyles.textDisabled,
            ]}
            numberOfLines={1}
          >
            {selectedOption?.label || placeholder}
          </Text>
          <Text style={wStyles.arrow}>{isOpen ? "▲" : "▼"}</Text>
        </TouchableOpacity>
        {error && <Text style={styles.error}>{error}</Text>}
        {isOpen && (
          <WebPopover
            anchorRef={anchorRef}
            options={options}
            value={value}
            searchable={searchable}
            searchPlaceholder={searchPlaceholder}
            compact={compact}
            onSelect={onSelect}
            onClose={() => setIsOpen(false)}
          />
        )}
      </View>
    );
  }

  // ── Mobile ────────────────────────────────────────────────────────────────
  const handleMobilePress = () => {
    if (!disabled) {
      setSearchText("");
      setIsOpen(true);
    }
  };

  const filteredOptions =
    searchable && searchText.trim()
      ? options.filter((o) =>
          o.label.toLowerCase().includes(searchText.toLowerCase()),
        )
      : options;

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        style={[
          styles.selector,
          error && styles.selectorError,
          disabled && styles.selectorDisabled,
        ]}
        onPress={handleMobilePress}
        activeOpacity={disabled ? 1 : 0.7}
      >
        <Text
          style={[
            styles.selectorText,
            !selectedOption && styles.placeholder,
            disabled && styles.textDisabled,
          ]}
        >
          {selectedOption?.label || placeholder}
        </Text>
        <Text style={[styles.arrow, disabled && styles.textDisabled]}>▼</Text>
      </TouchableOpacity>
      {error && <Text style={styles.error}>{error}</Text>}

      <Modal visible={isOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.overlay}
          onPress={() => setIsOpen(false)}
          activeOpacity={1}
        >
          <View style={styles.dropdown}>
            {searchable && (
              <View style={styles.searchContainer}>
                <TextInput
                  style={styles.searchInput}
                  placeholder={searchPlaceholder}
                  placeholderTextColor={COLORS.textMuted}
                  value={searchText}
                  onChangeText={setSearchText}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            )}
            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No results found</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.option,
                    item.value === value && styles.optionSelected,
                  ]}
                  onPress={() => {
                    onSelect(item.value);
                    setIsOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      item.value === value && styles.optionTextSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// ── Mobile styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { marginTop: SPACING.xs },
  label: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  selector: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: SPACING.sm,
  },
  selectorError: { borderColor: COLORS.error },
  selectorDisabled: { backgroundColor: COLORS.background, opacity: 0.6 },
  selectorText: { fontSize: FONT_SIZES.md, color: COLORS.text, flex: 1 },
  placeholder: { color: COLORS.textMuted },
  textDisabled: { color: COLORS.textSecondary },
  arrow: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginLeft: 4 },
  error: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.error,
    marginTop: SPACING.xs,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  dropdown: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    maxHeight: 400,
  },
  searchContainer: {
    padding: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  searchInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  emptyContainer: { paddingVertical: SPACING.lg, alignItems: "center" },
  emptyText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },
  option: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  optionSelected: { backgroundColor: COLORS.primaryDark },
  optionText: { fontSize: FONT_SIZES.md, color: COLORS.text },
  optionTextSelected: { color: COLORS.white, fontWeight: "600" },
});

// ── Web styles — fixed 38px height to match all other inputs ─────────────────
const wStyles = StyleSheet.create({
  container: { marginTop: 0 },
  selector: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    height: 38, // ← fixed height, matches TextInput
    paddingHorizontal: 10,
    paddingVertical: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectorCompact: {
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  selectorOpen: { borderColor: COLORS.primary },
  selectorError: { borderColor: COLORS.error },
  selectorDisabled: { backgroundColor: COLORS.background, opacity: 0.6 },
  selectorText: { fontSize: 13, color: COLORS.text, flex: 1 },
  selectorTextCompact: { fontSize: 12 },
  placeholder: { color: COLORS.textMuted },
  textDisabled: { color: COLORS.textSecondary },
  arrow: { fontSize: 10, color: COLORS.textMuted, marginLeft: 4 },
});
