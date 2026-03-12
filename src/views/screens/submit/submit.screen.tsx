import { useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import {
  EQUIPMENT_OPTIONS,
  GAME_TYPES,
  RECURRENCE_TYPES,
  START_TIMES,
  THUMBNAIL_OPTIONS,
  TOURNAMENT_FORMATS,
} from "../../../utils/tournament-form-data";
import { useScrollToTopOnFocus } from "../../../viewmodels/hooks/use.scroll.to.top";
import { useSubmitTournament } from "../../../viewmodels/useSubmitTournament";
import { Button } from "../../components/common/button";
import { DatePicker } from "../../components/common/date-picker";
import { Dropdown } from "../../components/common/dropdown";
import { ToggleSwitch } from "../../components/common/toggle-switch";
import { WebContainer } from "../../components/common/WebContainer";
import { styles } from "./submit.styles";

const isWeb = Platform.OS === "web";

const dateToString = (date: Date | null): string => {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const stringToDate = (dateString: string): Date | null => {
  if (!dateString) return null;
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// ── Two-column layout helpers ────────────────────────────────────────────────
const Row = ({ children }: { children: React.ReactNode }) =>
  isWeb ? (
    <View style={{ flexDirection: "row", gap: 16 }}>{children}</View>
  ) : (
    <>{children}</>
  );

const Col = ({ children }: { children?: React.ReactNode }) =>
  isWeb ? (
    <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
  ) : (
    <>{children}</>
  );

// ── Web date input with calendar icon ────────────────────────────────────────
const WebDateInput = ({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) => (
  <div style={{ position: "relative", zIndex: 10, width: "100%" }}>
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        height: 38,
        backgroundColor: "#1C1C1E",
        border: "1px solid #333",
        borderRadius: 6,
        paddingLeft: 10,
        paddingRight: 10,
        fontSize: 13,
        color: value ? "#fff" : "#666",
        outline: "none",
        boxSizing: "border-box",
        cursor: "pointer",
        colorScheme: "dark",
      }}
    />
  </div>
);

// ── Toggle row wrapper for web ────────────────────────────────────────────────
const ToggleRow = ({
  label,
  value,
  onValueChange,
  disabled,
  hint,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) =>
  isWeb ? (
    <View style={{ marginTop: 12, marginBottom: 4 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          alignSelf: "flex-start",
        }}
      >
        <Text
          style={{
            fontSize: 13,
            color: disabled ? COLORS.textMuted : COLORS.text,
          }}
        >
          {label}
        </Text>
        <ToggleSwitch
          label=""
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
        />
      </View>
      {hint && (
        <Text
          style={{
            fontSize: 10,
            color: COLORS.textMuted,
            marginTop: 3,
            fontStyle: "italic",
          }}
        >
          {hint}
        </Text>
      )}
    </View>
  ) : (
    <ToggleSwitch
      label={label}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    />
  );

// ── Field wrapper ensures consistent top spacing ──────────────────────────────
const Field = ({
  label,
  children,
  disabled,
  hint,
  first,
}: {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  hint?: string;
  first?: boolean;
}) => (
  <View
    style={[
      disabled ? styles.disabledFieldWrapper : undefined,
      isWeb && { marginTop: first ? 4 : 16 },
    ]}
  >
    <Text
      style={[
        styles.label,
        disabled && styles.labelDisabled,
        isWeb && { marginTop: 0, marginBottom: 5 },
      ]}
    >
      {label}
    </Text>
    {children}
    {hint && <Text style={styles.chipDisabledHint}>{hint}</Text>}
  </View>
);

// ─── Component ────────────────────────────────────────────────────────────────
export const SubmitScreen = () => {
  const vm = useSubmitTournament();
  const scrollRef = useScrollToTopOnFocus();

  useEffect(() => {
    Keyboard.dismiss();
    const show = Keyboard.addListener("keyboardDidShow", () => {});
    const hide = Keyboard.addListener("keyboardDidHide", () => {});
    return () => {
      show?.remove();
      hide?.remove();
    };
  }, []);

  if (vm.isLoading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.subtitle}>Loading...</Text>
      </View>
    );
  }

  if (!vm.user) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emoji}>🔒</Text>
        <Text style={styles.title}>Login Required</Text>
        <Text style={styles.subtitle}>
          Please log in to submit tournaments.
        </Text>
        <Button title="Log In" onPress={vm.navigateToLogin} />
      </View>
    );
  }

  if (!vm.canSubmitTournaments) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emoji}>🎱</Text>
        <Text style={styles.title}>Become a Tournament Director</Text>
        <Text style={styles.subtitle}>
          Want to submit tournaments? Contact us to become a Tournament
          Director.
        </Text>
        <Button title="Contact Us" onPress={vm.navigateToFaq} />
      </View>
    );
  }

  const renderThumbnailOption = (thumb: any) => {
    const isSelected = vm.formData.thumbnail === thumb.id;
    const isUploadOption = thumb.id === "upload-custom";
    const isCustomImage = vm.formData.thumbnail?.startsWith("custom:");
    const showUploadedImage =
      isUploadOption && isCustomImage && vm.customImageUri;
    const imageUrl = thumb.imageUrl ? vm.getThumbnailImageUrl(thumb.id) : null;
    return (
      <TouchableOpacity
        key={thumb.id}
        style={[
          styles.thumbnailOption,
          isSelected && styles.thumbnailSelected,
          vm.uploadingImage && isUploadOption && styles.thumbnailUploading,
        ]}
        onPress={() => vm.handleThumbnailSelect(thumb.id)}
        disabled={vm.uploadingImage && isUploadOption}
      >
        <View style={styles.thumbnailPlaceholder}>
          {isUploadOption ? (
            showUploadedImage ? (
              <Image
                source={{ uri: vm.customImageUri || undefined }}
                style={styles.thumbnailImage}
                resizeMode="cover"
              />
            ) : vm.uploadingImage ? (
              <Text style={styles.uploadingText}>...</Text>
            ) : (
              <Text style={styles.thumbnailEmoji}>+</Text>
            )
          ) : imageUrl ? (
            <Image
              source={{ uri: imageUrl || undefined }}
              style={styles.thumbnailImage}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.thumbnailEmoji}>🎱</Text>
          )}
          <Text
            style={[styles.thumbnailText, isUploadOption && styles.uploadText]}
          >
            {thumb.name}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFormSection = ({ item }: { item: any }) => {
    switch (item.type) {
      case "header":
        return (
          <View style={styles.header}>
            <Text style={styles.headerTitle}>SUBMIT TOURNAMENT</Text>
            <Text style={styles.headerSubtitle}>
              {vm.formData.isRecurring
                ? "Create a recurring tournament series"
                : "Submit your tournament for approval"}
            </Text>
          </View>
        );

      case "template":
        return vm.hasTemplates ? (
          <View style={styles.section}>
            <Dropdown
              label="Use a Template"
              placeholder="Start Fresh (No Template)"
              options={vm.templateOptions}
              value={vm.formData.templateId?.toString() || ""}
              onSelect={vm.handleTemplateSelect}
            />
          </View>
        ) : null;

      case "director":
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tournament Director</Text>
            <View style={styles.readOnlyCard}>
              <Text style={styles.directorName}>{vm.profile?.name}</Text>
              <Text style={styles.directorId}>ID: {vm.profile?.id_auto}</Text>
            </View>
          </View>
        );

      case "details":
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tournament Details</Text>

            <Field label="Tournament Name *" first>
              <TextInput
                ref={vm.refs.name}
                style={styles.input}
                value={vm.formData.name}
                onChangeText={(v) => vm.updateFormData("name", v)}
                placeholder={
                  vm.formData.isRecurring
                    ? "Enter series name..."
                    : "Enter tournament name..."
                }
                placeholderTextColor={COLORS.textMuted}
                returnKeyType="next"
                onSubmitEditing={() => vm.refs.gameSpot.current?.focus()}
              />
            </Field>

            <Row>
              <Col>
                <Field label="Game Type *">
                  <View style={styles.dropdownContainer}>
                    <Dropdown
                      placeholder="Select The Game Type"
                      options={GAME_TYPES}
                      value={vm.formData.gameType}
                      onSelect={(v) => vm.updateFormData("gameType", v)}
                    />
                  </View>
                </Field>
              </Col>
              <Col>
                <Field label="Tournament Format *">
                  <View style={styles.dropdownContainer}>
                    <Dropdown
                      placeholder="Select The Format"
                      options={TOURNAMENT_FORMATS}
                      value={vm.formData.tournamentFormat}
                      onSelect={(v) => vm.updateFormData("tournamentFormat", v)}
                    />
                  </View>
                </Field>
              </Col>
            </Row>

            {vm.isChipTournament && (
              <View style={styles.chipSection}>
                <View style={styles.chipHeader}>
                  <Text style={styles.chipTitle}>🎰 Chip Configuration</Text>
                  <TouchableOpacity
                    style={styles.chipResetButton}
                    onPress={vm.resetChipRangesToDefault}
                  >
                    <Text style={styles.chipResetText}>Reset Defaults</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.chipDescription}>
                  Set Fargo rating ranges and chip allocation.
                </Text>
                <View style={styles.chipRowHeader}>
                  <Text style={[styles.chipColumnLabel, { flex: 1.4 }]}>
                    Label
                  </Text>
                  <Text style={[styles.chipColumnLabel, { flex: 0.8 }]}>
                    Min
                  </Text>
                  <Text style={[styles.chipColumnLabel, { flex: 0.8 }]}>
                    Max
                  </Text>
                  <Text style={[styles.chipColumnLabel, { flex: 0.6 }]}>
                    Chips
                  </Text>
                  <View style={{ width: 36 }} />
                </View>
                {vm.formData.chipRanges.map((range, index) => (
                  <View key={index} style={styles.chipRow}>
                    <TextInput
                      style={[
                        styles.chipInput,
                        styles.chipLabelInput,
                        { flex: 1.4 },
                      ]}
                      value={range.label}
                      onChangeText={(v) =>
                        vm.updateChipRange(index, "label", v)
                      }
                      placeholder="e.g., SL7"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <TextInput
                      style={[styles.chipInput, { flex: 0.8 }]}
                      value={range.minRating.toString()}
                      onChangeText={(v) =>
                        vm.updateChipRange(index, "minRating", v)
                      }
                      placeholder="0"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="numeric"
                    />
                    <TextInput
                      style={[styles.chipInput, { flex: 0.8 }]}
                      value={range.maxRating.toString()}
                      onChangeText={(v) =>
                        vm.updateChipRange(index, "maxRating", v)
                      }
                      placeholder="299"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="numeric"
                    />
                    <TextInput
                      style={[styles.chipInput, { flex: 0.6 }]}
                      value={range.chips.toString()}
                      onChangeText={(v) =>
                        vm.updateChipRange(index, "chips", v)
                      }
                      placeholder="8"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="numeric"
                    />
                    <TouchableOpacity
                      style={styles.chipRemoveButton}
                      onPress={() => vm.removeChipRange(index)}
                    >
                      <Text style={styles.removeButton}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.chipAddButton}
                  onPress={vm.addChipRange}
                >
                  <Text style={styles.chipAddButtonText}>+ Add Range</Text>
                </TouchableOpacity>
                {vm.formData.chipRanges.length > 0 && (
                  <View style={styles.chipPreview}>
                    <Text style={styles.chipPreviewTitle}>
                      📋 Chip Breakdown
                    </Text>
                    {vm.formData.chipRanges.map((range, i) => (
                      <Text key={i} style={styles.chipPreviewRow}>
                        {range.label || `${range.minRating}–${range.maxRating}`}{" "}
                        → {range.chips} chip{range.chips !== 1 ? "s" : ""}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            )}

            <Row>
              <Col>
                <Field
                  label="Game Spot"
                  disabled={vm.isChipTournament}
                  hint={
                    vm.isChipTournament ? "Uses chip ranges instead" : undefined
                  }
                >
                  <TextInput
                    ref={vm.refs.gameSpot}
                    style={[
                      styles.input,
                      vm.isChipTournament && styles.inputDisabled,
                    ]}
                    value={vm.formData.gameSpot}
                    onChangeText={(v) => vm.updateFormData("gameSpot", v)}
                    placeholder={vm.isChipTournament ? "N/A" : "e.g., The Ball"}
                    placeholderTextColor={COLORS.textMuted}
                    editable={!vm.isChipTournament}
                  />
                </Field>
              </Col>
              <Col>
                <Field
                  label="Race"
                  disabled={vm.isChipTournament}
                  hint={
                    vm.isChipTournament ? "Uses chip ranges instead" : undefined
                  }
                >
                  <TextInput
                    ref={vm.refs.race}
                    style={[
                      styles.input,
                      vm.isChipTournament && styles.inputDisabled,
                    ]}
                    value={vm.formData.race}
                    onChangeText={(v) => vm.updateFormData("race", v)}
                    placeholder={
                      vm.isChipTournament ? "N/A" : "e.g., Race to 5"
                    }
                    placeholderTextColor={COLORS.textMuted}
                    editable={!vm.isChipTournament}
                  />
                </Field>
              </Col>
            </Row>

            <Field label="Description">
              <TextInput
                ref={vm.refs.description}
                style={[styles.input, styles.textArea]}
                value={vm.formData.description}
                onChangeText={(v) => vm.updateFormData("description", v)}
                placeholder={
                  vm.formData.isRecurring
                    ? "Describe your series..."
                    : "Enter description..."
                }
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </Field>
          </View>
        );

      case "fargo":
        return (
          <View
            style={[
              styles.section,
              vm.isChipTournament && styles.sectionDisabled,
            ]}
          >
            <Text
              style={[
                styles.sectionTitle,
                vm.isChipTournament && styles.labelDisabled,
              ]}
            >
              Fargo Requirements
            </Text>
            {vm.isChipTournament && (
              <View style={styles.chipDisabledBanner}>
                <Text style={styles.chipDisabledBannerText}>
                  🎰 Fargo ranges configured in Chip Configuration above
                </Text>
              </View>
            )}
            <Field
              first
              label="Maximum Fargo"
              disabled={vm.isChipTournament}
              hint={
                !vm.isChipTournament && vm.isMaxFargoDisabled
                  ? "Disabled when Open Tournament is ON"
                  : undefined
              }
            >
              <View style={isWeb ? { maxWidth: 200 } : undefined}>
                <TextInput
                  ref={vm.refs.maxFargo}
                  style={[
                    styles.input,
                    (vm.isMaxFargoDisabled || vm.isChipTournament) &&
                      styles.inputDisabled,
                  ]}
                  value={vm.formData.maxFargo}
                  onChangeText={(v) => vm.updateFormData("maxFargo", v)}
                  placeholder={
                    vm.isChipTournament
                      ? "N/A"
                      : vm.isMaxFargoDisabled
                        ? "Disabled"
                        : "e.g., 550 (leave blank for open)"
                  }
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                  editable={!vm.isMaxFargoDisabled && !vm.isChipTournament}
                />
              </View>
            </Field>
          </View>
        );

      case "fees":
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Entry & Fees</Text>
            {isWeb ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                  marginTop: 4,
                }}
              >
                <View style={{ width: 160 }}>
                  <Text
                    style={[
                      styles.label,
                      isWeb && { marginTop: 0, marginBottom: 5 },
                    ]}
                  >
                    Entry Fee
                  </Text>
                  <TextInput
                    ref={vm.refs.entryFee}
                    style={styles.input}
                    value={vm.formData.entryFee}
                    onChangeText={(v) => vm.updateFormData("entryFee", v)}
                    placeholder="$0.00"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingTop: 16,
                  }}
                >
                  <Text style={{ fontSize: 13, color: COLORS.text }}>
                    Calcutta
                  </Text>
                  <ToggleSwitch
                    label=""
                    value={vm.formData.calcutta}
                    onValueChange={(v) => vm.updateFormData("calcutta", v)}
                  />
                </View>
              </View>
            ) : (
              <>
                <Field label="Entry Fee">
                  <TextInput
                    ref={vm.refs.entryFee}
                    style={styles.input}
                    value={vm.formData.entryFee}
                    onChangeText={(v) => vm.updateFormData("entryFee", v)}
                    placeholder="$0.00"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="decimal-pad"
                  />
                </Field>
                <ToggleSwitch
                  label="Calcutta"
                  value={vm.formData.calcutta}
                  onValueChange={(v) => vm.updateFormData("calcutta", v)}
                />
              </>
            )}

            <View
              style={[
                styles.sidePotHeader,
                isWeb && {
                  marginTop: 12,
                  justifyContent: "flex-start",
                  gap: 10,
                },
              ]}
            >
              <Text style={[styles.label, isWeb && { marginTop: 0 }]}>
                Side Pots
              </Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={vm.addSidePot}
              >
                <Text style={styles.addButtonText}>+ Add</Text>
              </TouchableOpacity>
            </View>
            {vm.sidePots.map((pot, index) => (
              <View key={index} style={styles.sidePotRow}>
                <TextInput
                  style={[styles.input, styles.sidePotName]}
                  value={pot.name}
                  onChangeText={(v) => vm.updateSidePot(index, "name", v)}
                  placeholder="Name"
                  placeholderTextColor={COLORS.textMuted}
                />
                <TextInput
                  style={[styles.input, styles.sidePotAmount]}
                  value={pot.amount}
                  onChangeText={(v) => vm.updateSidePot(index, "amount", v)}
                  placeholder="$"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity
                  style={styles.removeButtonContainer}
                  onPress={() => vm.removeSidePot(index)}
                >
                  <Text style={styles.removeButton}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        );

      case "settings":
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Settings</Text>
            {isWeb ? (
              <View style={{ marginTop: 0 }}>
                {[
                  {
                    label: "Reports to Fargo",
                    value: vm.formData.reportsToFargo,
                    onChange: (v: boolean) =>
                      vm.updateFormData("reportsToFargo", v),
                  },
                  {
                    label: "Open Tournament",
                    value: vm.formData.openTournament,
                    onChange: (v: boolean) =>
                      vm.updateFormData("openTournament", v),
                    disabled:
                      vm.isOpenTournamentDisabled || vm.isChipTournament,
                    hint: vm.isChipTournament
                      ? "Uses chip allocation instead"
                      : vm.isOpenTournamentDisabled
                        ? "Disabled when Max Fargo is set"
                        : undefined,
                  },
                  {
                    label: "Recurring Tournament",
                    value: vm.formData.isRecurring,
                    onChange: (v: boolean) =>
                      vm.updateFormData("isRecurring", v),
                    hint: vm.formData.isRecurring
                      ? "🔄 Creates a series using your selected date/time as the repeating pattern"
                      : "💡 Toggle ON to create a recurring tournament series",
                  },
                ].map((row, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: COLORS.border + "40",
                      alignSelf: "flex-start",
                    }}
                  >
                    <View>
                      <Text
                        style={{
                          fontSize: 13,
                          color: row.disabled ? COLORS.textMuted : COLORS.text,
                        }}
                      >
                        {row.label}
                      </Text>
                      {row.hint && (
                        <Text
                          style={{
                            fontSize: 10,
                            color: COLORS.textMuted,
                            marginTop: 1,
                            fontStyle: "italic",
                          }}
                        >
                          {row.hint}
                        </Text>
                      )}
                    </View>
                    <ToggleSwitch
                      label=""
                      value={row.value}
                      onValueChange={row.onChange}
                      disabled={row.disabled}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <>
                <ToggleSwitch
                  label="Reports to Fargo"
                  value={vm.formData.reportsToFargo}
                  onValueChange={(v) => vm.updateFormData("reportsToFargo", v)}
                />
                <ToggleSwitch
                  label="Open Tournament"
                  value={vm.formData.openTournament}
                  onValueChange={(v) => vm.updateFormData("openTournament", v)}
                  disabled={vm.isOpenTournamentDisabled || vm.isChipTournament}
                />
                <ToggleSwitch
                  label="Recurring Tournament"
                  value={vm.formData.isRecurring}
                  onValueChange={(v) => vm.updateFormData("isRecurring", v)}
                />
              </>
            )}
          </View>
        );

      case "schedule":
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {vm.formData.isRecurring ? "Schedule" : "Date & Time"}
            </Text>

            <Row>
              <Col>
                <Field
                  first
                  label={
                    vm.formData.isRecurring
                      ? "First Tournament Date *"
                      : "Tournament Date *"
                  }
                >
                  {isWeb ? (
                    <View style={{ maxWidth: 200 }}>
                      <WebDateInput
                        value={dateToString(vm.formData.tournamentDate)}
                        onChange={(v) =>
                          vm.updateFormData("tournamentDate", stringToDate(v))
                        }
                      />
                    </View>
                  ) : (
                    <View style={styles.staticWrapper}>
                      <DatePicker
                        value={dateToString(vm.formData.tournamentDate)}
                        onChange={(v) =>
                          vm.updateFormData("tournamentDate", stringToDate(v))
                        }
                        placeholder="Select tournament date"
                      />
                    </View>
                  )}
                </Field>
              </Col>
              <Col>
                <Field first label="Start Time *">
                  <View
                    style={[
                      styles.dropdownContainer,
                      isWeb && { maxWidth: 200 },
                    ]}
                  >
                    <Dropdown
                      placeholder="Select Start Time"
                      options={START_TIMES}
                      value={vm.formData.startTime}
                      onSelect={(v) => vm.updateFormData("startTime", v)}
                    />
                  </View>
                </Field>
              </Col>
            </Row>

            {vm.formData.isRecurring && (
              <>
                <Row>
                  <Col>
                    <Field label="How Often *">
                      <View style={styles.dropdownContainer}>
                        <Dropdown
                          placeholder="How often does this repeat?"
                          options={RECURRENCE_TYPES}
                          value={vm.formData.recurrenceType}
                          onSelect={(v) =>
                            vm.updateFormData("recurrenceType", v)
                          }
                        />
                      </View>
                    </Field>
                  </Col>
                  <Col>
                    <Field label="Series End Date (Optional)">
                      {isWeb ? (
                        <WebDateInput
                          value={dateToString(vm.formData.seriesEndDate)}
                          onChange={(v) =>
                            vm.updateFormData("seriesEndDate", stringToDate(v))
                          }
                        />
                      ) : (
                        <View style={styles.staticWrapper}>
                          <DatePicker
                            value={dateToString(vm.formData.seriesEndDate)}
                            onChange={(v) =>
                              vm.updateFormData(
                                "seriesEndDate",
                                stringToDate(v),
                              )
                            }
                            placeholder="Leave blank for ongoing"
                          />
                        </View>
                      )}
                    </Field>
                  </Col>
                </Row>

                {vm.formData.tournamentDate &&
                  vm.formData.startTime &&
                  vm.formData.recurrenceType && (
                    <View style={styles.schedulePreview}>
                      <Text style={styles.previewTitle}>📅 Your Schedule</Text>
                      <Text style={styles.previewStarting}>
                        Starting:{" "}
                        {vm.formData.tournamentDate.toLocaleDateString(
                          "en-US",
                          { weekday: "long", month: "long", day: "numeric" },
                        )}{" "}
                        at{" "}
                        {(() => {
                          const [h, m] = vm.formData.startTime.split(":");
                          const hr = parseInt(h);
                          return `${hr % 12 || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
                        })()}
                      </Text>
                      <Text style={styles.previewPattern}>
                        🔄 Repeats {vm.formData.recurrenceType}
                      </Text>
                      <Text style={styles.previewNote}>
                        Future tournaments auto-created 30 days ahead
                      </Text>
                    </View>
                  )}
              </>
            )}
            <Text style={styles.hint}>Timezone: {vm.formData.timezone}</Text>
          </View>
        );

      case "venue":
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Venue</Text>

            <Field label="Select Venue *" first>
              <View
                style={[styles.dropdownContainer, isWeb && { maxWidth: 380 }]}
              >
                <Dropdown
                  placeholder="Choose your venue"
                  options={vm.venueOptions}
                  value={vm.formData.venueId?.toString() || ""}
                  onSelect={vm.handleVenueSelect}
                />
              </View>
            </Field>

            {vm.selectedVenue && (
              <View style={styles.venueCard}>
                <Text style={styles.venueName}>{vm.selectedVenue.venue}</Text>
                <Text style={styles.venueAddress}>
                  {vm.selectedVenue.address}
                </Text>
                <Text style={styles.venueAddress}>
                  {vm.selectedVenue.city}, {vm.selectedVenue.state}{" "}
                  {vm.selectedVenue.zip_code}
                </Text>
              </View>
            )}

            {vm.selectedVenue &&
              !vm.loadingVenueTables &&
              !vm.venueHasTables && (
                <View style={styles.noTablesWarning}>
                  <Text style={styles.noTablesText}>
                    ⚠️ No tables configured for this venue
                  </Text>
                  <Text style={styles.noTablesSubtext}>
                    Contact the venue owner to set up table information.
                  </Text>
                </View>
              )}

            {vm.loadingVenueTables && (
              <View style={styles.venueTablesInfo}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.venueTablesLabel}>
                  Loading venue tables...
                </Text>
              </View>
            )}

            {vm.selectedVenue && vm.venueHasTables && (
              <>
                <View style={styles.venueTablesInfo}>
                  <Text style={styles.venueTablesLabel}>
                    🎱 Tables at this venue:
                  </Text>
                  {vm.venueTables.map((table, idx) => (
                    <Text key={idx} style={styles.venueTableRow}>
                      • {table.custom_size || table.table_size}
                      {table.brand ? ` (${table.brand})` : ""}
                      {table.quantity > 1 ? ` ×${table.quantity}` : ""}
                    </Text>
                  ))}
                </View>
                <Row>
                  <Col>
                    <Field label="Table Size *">
                      <View style={styles.dropdownContainer}>
                        <Dropdown
                          placeholder="Select Table Size"
                          options={vm.venueTableSizeOptions}
                          value={vm.formData.tableSize}
                          onSelect={(v) => vm.updateFormData("tableSize", v)}
                        />
                      </View>
                    </Field>
                  </Col>
                  <Col>
                    <Field label="Equipment">
                      <View style={styles.dropdownContainer}>
                        <Dropdown
                          placeholder="Select Equipment"
                          options={
                            vm.equipmentOptionsFromVenue.length > 0
                              ? vm.equipmentOptionsFromVenue
                              : EQUIPMENT_OPTIONS
                          }
                          value={vm.formData.equipment}
                          onSelect={(v) => vm.updateFormData("equipment", v)}
                        />
                      </View>
                    </Field>
                  </Col>
                </Row>
              </>
            )}

            <Row>
              <Col>
                <Field label="Contact Phone">
                  <TextInput
                    ref={vm.refs.phone}
                    style={styles.input}
                    value={vm.formData.phoneNumber}
                    onChangeText={(v) => vm.updateFormData("phoneNumber", v)}
                    placeholder="Enter contact phone..."
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="phone-pad"
                  />
                </Field>
              </Col>
              <Col />
            </Row>
          </View>
        );

      case "thumbnail":
        return (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isWeb && { marginBottom: 4 }]}>
              {vm.formData.isRecurring ? "Series Image" : "Tournament Image"}
            </Text>
            <View style={styles.thumbnailGrid}>
              {THUMBNAIL_OPTIONS.map(renderThumbnailOption)}
            </View>
          </View>
        );

      case "submit":
        return (
          <View style={styles.submitSection}>
            <Button
              title={
                vm.submitting
                  ? "Creating..."
                  : vm.formData.isRecurring
                    ? "Create Tournament Series"
                    : "Submit Tournament"
              }
              onPress={vm.handleSubmit}
              loading={vm.submitting}
              disabled={vm.submitting}
              fullWidth
            />
            {vm.formData.isRecurring && (
              <Text style={styles.submitHint}>
                This will create your tournament template and schedule the first
                tournament
              </Text>
            )}
          </View>
        );

      default:
        return null;
    }
  };

  const formSections = [
    { type: "header", key: "header" },
    { type: "template", key: "template" },
    { type: "director", key: "director" },
    { type: "details", key: "details" },
    { type: "fargo", key: "fargo" },
    { type: "fees", key: "fees" },
    { type: "settings", key: "settings" },
    { type: "schedule", key: "schedule" },
    { type: "venue", key: "venue" },
    { type: "thumbnail", key: "thumbnail" },
    { type: "submit", key: "submit" },
  ];

  return (
    <WebContainer>
      <View
        style={[
          styles.container,
          isWeb && {
            maxWidth: 800,
            alignSelf: "center" as const,
            width: "100%" as any,
          },
        ]}
      >
        <FlatList
          ref={scrollRef}
          data={formSections}
          renderItem={renderFormSection}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={false}
          scrollEnabled={true}
          onScrollBeginDrag={() => Keyboard.dismiss()}
        />
      </View>
    </WebContainer>
  );
};

export default SubmitScreen;
