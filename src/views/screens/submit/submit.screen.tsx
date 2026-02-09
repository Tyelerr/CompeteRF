import { useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
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
import { styles } from "./submit.styles";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const dateToString = (date: Date | null): string => {
  if (!date) return "";
  return date.toISOString().split("T")[0];
};

const stringToDate = (dateString: string): Date | null => {
  if (!dateString) return null;
  return new Date(dateString);
};

// ─── Component ───────────────────────────────────────────────────────────────

export const SubmitScreen = () => {
  const vm = useSubmitTournament();
  const scrollRef = useScrollToTopOnFocus();

  // Dismiss keyboard on mount
  useEffect(() => {
    Keyboard.dismiss();
    const show = Keyboard.addListener("keyboardDidShow", () => {});
    const hide = Keyboard.addListener("keyboardDidHide", () => {});
    return () => {
      show?.remove();
      hide?.remove();
    };
  }, []);

  // ── Loading state ──────────────────────────────────────────────────────

  if (vm.isLoading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.subtitle}>Loading...</Text>
      </View>
    );
  }

  // ── Not logged in ─────────────────────────────────────────────────────

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

  // ── Not authorized ────────────────────────────────────────────────────

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

  // ── Thumbnail renderer ────────────────────────────────────────────────

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
              onError={() => console.log("Image failed to load:", imageUrl)}
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

  // ── Recurring hint style ──────────────────────────────────────────────

  const recurringHintStyle = [
    styles.recurringHint,
    { color: vm.formData.isRecurring ? COLORS.primary : COLORS.textMuted },
  ];

  // ── Section renderer ──────────────────────────────────────────────────

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

            <Text style={styles.label}>Tournament Name *</Text>
            <TextInput
              ref={vm.refs.name}
              style={styles.input}
              value={vm.formData.name}
              onChangeText={(v) => vm.updateFormData("name", v)}
              placeholder={
                vm.formData.isRecurring
                  ? "Enter series name (e.g., 'Weekly 8-Ball League')"
                  : "Enter tournament name..."
              }
              placeholderTextColor={COLORS.textMuted}
              returnKeyType="next"
              onSubmitEditing={() => vm.refs.gameSpot.current?.focus()}
            />

            <View style={styles.dropdownContainer}>
              <Dropdown
                label="Game Type *"
                placeholder="Select The Game Type"
                options={GAME_TYPES}
                value={vm.formData.gameType}
                onSelect={(v) => vm.updateFormData("gameType", v)}
              />
            </View>

            <View style={styles.dropdownContainer}>
              <Dropdown
                label="Tournament Format *"
                placeholder="Select The Format"
                options={TOURNAMENT_FORMATS}
                value={vm.formData.tournamentFormat}
                onSelect={(v) => vm.updateFormData("tournamentFormat", v)}
              />
            </View>

            {/* Chip Tournament Configuration */}
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
                  Set Fargo rating ranges and how many chips each range
                  receives. Lower-rated players typically get more chips.
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
                    {vm.formData.chipRanges.map((range, index) => (
                      <Text key={index} style={styles.chipPreviewRow}>
                        {range.label || `${range.minRating}–${range.maxRating}`}{" "}
                        → {range.chips} chip{range.chips !== 1 ? "s" : ""}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Game Spot */}
            <View
              style={
                vm.isChipTournament ? styles.disabledFieldWrapper : undefined
              }
            >
              <Text
                style={[
                  styles.label,
                  vm.isChipTournament && styles.labelDisabled,
                ]}
              >
                Game Spot
              </Text>
              <TextInput
                ref={vm.refs.gameSpot}
                style={[
                  styles.input,
                  vm.isChipTournament && styles.inputDisabled,
                ]}
                value={vm.formData.gameSpot}
                onChangeText={(v) => vm.updateFormData("gameSpot", v)}
                placeholder={
                  vm.isChipTournament
                    ? "N/A for Chip Tournament"
                    : "e.g., The Ball"
                }
                placeholderTextColor={COLORS.textMuted}
                returnKeyType="next"
                onSubmitEditing={() => vm.refs.race.current?.focus()}
                editable={!vm.isChipTournament}
              />
              {vm.isChipTournament && (
                <Text style={styles.chipDisabledHint}>
                  Chip tournaments use chip ranges instead
                </Text>
              )}
            </View>

            {/* Race */}
            <View
              style={
                vm.isChipTournament ? styles.disabledFieldWrapper : undefined
              }
            >
              <Text
                style={[
                  styles.label,
                  vm.isChipTournament && styles.labelDisabled,
                ]}
              >
                Race
              </Text>
              <TextInput
                ref={vm.refs.race}
                style={[
                  styles.input,
                  vm.isChipTournament && styles.inputDisabled,
                ]}
                value={vm.formData.race}
                onChangeText={(v) => vm.updateFormData("race", v)}
                placeholder={
                  vm.isChipTournament
                    ? "N/A for Chip Tournament"
                    : "e.g., Race to 5"
                }
                placeholderTextColor={COLORS.textMuted}
                returnKeyType="next"
                onSubmitEditing={() => vm.refs.description.current?.focus()}
                editable={!vm.isChipTournament}
              />
              {vm.isChipTournament && (
                <Text style={styles.chipDisabledHint}>
                  Chip tournaments use chip ranges instead
                </Text>
              )}
            </View>

            <Text style={styles.label}>Description</Text>
            <TextInput
              ref={vm.refs.description}
              style={[styles.input, styles.textArea]}
              value={vm.formData.description}
              onChangeText={(v) => vm.updateFormData("description", v)}
              placeholder={
                vm.formData.isRecurring
                  ? "Describe your tournament series..."
                  : "Enter description..."
              }
              placeholderTextColor={COLORS.textMuted}
              multiline={true}
              numberOfLines={3}
              textAlignVertical="top"
            />
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
                  🎰 Fargo ranges are configured in the Chip Configuration above
                </Text>
              </View>
            )}

            <Text
              style={[
                styles.label,
                vm.isChipTournament && styles.labelDisabled,
              ]}
            >
              Maximum Fargo
            </Text>
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
                  ? "N/A for Chip Tournament"
                  : vm.isMaxFargoDisabled
                    ? "Disabled (Open Tournament is ON)"
                    : "e.g., 550 (leave blank for open)"
              }
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
              returnKeyType="next"
              onSubmitEditing={() => vm.refs.requiredFargo.current?.focus()}
              editable={!vm.isMaxFargoDisabled && !vm.isChipTournament}
            />
            {!vm.isChipTournament && vm.isMaxFargoDisabled && (
              <Text style={styles.hintWarning}>
                Disabled when Open Tournament is ON
              </Text>
            )}
          </View>
        );

      case "fees":
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Entry & Fees</Text>

            <Text style={styles.label}>Entry Fee</Text>
            <TextInput
              ref={vm.refs.entryFee}
              style={styles.input}
              value={vm.formData.entryFee}
              onChangeText={(v) => vm.updateFormData("entryFee", v)}
              placeholder="$ 0.00"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
            />

            <View style={styles.sidePotHeader}>
              <Text style={styles.label}>Side Pots</Text>
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

            <ToggleSwitch
              label="Reports to Fargo"
              value={vm.formData.reportsToFargo}
              onValueChange={(v) => vm.updateFormData("reportsToFargo", v)}
            />

            <View
              style={
                vm.isChipTournament ? styles.disabledFieldWrapper : undefined
              }
            >
              <ToggleSwitch
                label="Open Tournament"
                value={vm.formData.openTournament}
                onValueChange={(v) => vm.updateFormData("openTournament", v)}
                disabled={vm.isOpenTournamentDisabled || vm.isChipTournament}
              />
              {vm.isChipTournament ? (
                <Text style={styles.chipDisabledHint}>
                  Chip tournaments use rating-based chip allocation instead
                </Text>
              ) : vm.isOpenTournamentDisabled ? (
                <Text style={styles.hintWarning}>
                  Disabled when Max Fargo is set
                </Text>
              ) : null}
            </View>

            <ToggleSwitch
              label="Recurring Tournament"
              value={vm.formData.isRecurring}
              onValueChange={(v) => vm.updateFormData("isRecurring", v)}
            />
            <Text style={recurringHintStyle}>
              {vm.formData.isRecurring
                ? "🔄 This will create a tournament series using your selected date and time as the repeating pattern"
                : "💡 Toggle this ON to create a recurring tournament series"}
            </Text>
          </View>
        );

      case "schedule":
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {vm.formData.isRecurring ? "Schedule" : "Date & Time"}
            </Text>

            <Text style={styles.label}>
              {vm.formData.isRecurring
                ? "First Tournament Date *"
                : "Tournament Date *"}
            </Text>

            <View style={styles.staticWrapper}>
              <DatePicker
                value={dateToString(vm.formData.tournamentDate)}
                onChange={(v) =>
                  vm.updateFormData("tournamentDate", stringToDate(v))
                }
                placeholder={
                  vm.formData.isRecurring
                    ? "When does your series begin?"
                    : "Select tournament date"
                }
              />
            </View>

            <View style={styles.dropdownContainer}>
              <Dropdown
                label="Start Time *"
                placeholder="Select Start Time"
                options={START_TIMES}
                value={vm.formData.startTime}
                onSelect={(v) => vm.updateFormData("startTime", v)}
              />
            </View>

            {vm.formData.isRecurring && (
              <>
                <View style={styles.dropdownContainer}>
                  <Dropdown
                    label="How Often *"
                    placeholder="How often does this repeat?"
                    options={RECURRENCE_TYPES}
                    value={vm.formData.recurrenceType}
                    onSelect={(v) => vm.updateFormData("recurrenceType", v)}
                  />
                </View>

                <Text style={styles.label}>
                  When Does The Series End? (Optional)
                </Text>

                <View style={styles.staticWrapper}>
                  <DatePicker
                    value={dateToString(vm.formData.seriesEndDate)}
                    onChange={(v) =>
                      vm.updateFormData("seriesEndDate", stringToDate(v))
                    }
                    placeholder="Leave blank for ongoing series"
                  />
                </View>

                {vm.formData.tournamentDate &&
                  vm.formData.startTime &&
                  vm.formData.recurrenceType && (
                    <View style={styles.schedulePreview}>
                      <Text style={styles.previewTitle}>📅 Your Schedule</Text>
                      <Text style={styles.previewStarting}>
                        Starting:{" "}
                        {vm.formData.tournamentDate.toLocaleDateString(
                          "en-US",
                          {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          },
                        )}{" "}
                        at{" "}
                        {(() => {
                          const [hours, minutes] =
                            vm.formData.startTime.split(":");
                          const hour = parseInt(hours);
                          const ampm = hour >= 12 ? "PM" : "AM";
                          const displayHour = hour % 12 || 12;
                          return `${displayHour}:${minutes} ${ampm}`;
                        })()}
                      </Text>
                      <Text style={styles.previewPattern}>
                        🔄 This time will repeat {vm.formData.recurrenceType}
                      </Text>
                      <Text style={styles.previewNote}>
                        Future tournaments will be created automatically (30
                        days ahead)
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

            <View style={styles.dropdownContainer}>
              <Dropdown
                label="Select Venue *"
                placeholder="Choose your venue"
                options={vm.venueOptions}
                value={vm.formData.venueId?.toString() || ""}
                onSelect={vm.handleVenueSelect}
              />
            </View>

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

            {/* No tables warning */}
            {vm.selectedVenue &&
              !vm.loadingVenueTables &&
              !vm.venueHasTables && (
                <View style={styles.noTablesWarning}>
                  <Text style={styles.noTablesText}>
                    ⚠️ No tables configured for this venue
                  </Text>
                  <Text style={styles.noTablesSubtext}>
                    This venue needs tables added before tournaments can be
                    created. Contact the venue owner to set up their table
                    information.
                  </Text>
                </View>
              )}

            {/* Loading venue tables */}
            {vm.loadingVenueTables && (
              <View style={styles.venueTablesInfo}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.venueTablesLabel}>
                  Loading venue tables...
                </Text>
              </View>
            )}

            {/* Venue tables info + dynamic dropdowns */}
            {vm.selectedVenue && vm.venueHasTables && (
              <>
                {/* Show what tables the venue has */}
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

                {/* Table Size — dynamic from venue_tables */}
                <View style={styles.dropdownContainer}>
                  <Dropdown
                    label="Table Size *"
                    placeholder="Select Table Size"
                    options={vm.venueTableSizeOptions}
                    value={vm.formData.tableSize}
                    onSelect={(v) => vm.updateFormData("tableSize", v)}
                  />
                </View>

                {/* Equipment — from venue brands if available, else defaults */}
                <View style={styles.dropdownContainer}>
                  <Dropdown
                    label="Equipment"
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
              </>
            )}

            <Text style={styles.label}>Contact Phone</Text>
            <TextInput
              ref={vm.refs.phone}
              style={styles.input}
              value={vm.formData.phoneNumber}
              onChangeText={(v) => vm.updateFormData("phoneNumber", v)}
              placeholder="Enter contact phone..."
              placeholderTextColor={COLORS.textMuted}
              keyboardType="phone-pad"
            />
          </View>
        );

      case "thumbnail":
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
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

  // ── Form sections ─────────────────────────────────────────────────────

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
    <View style={styles.container}>
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
  );
};

export default SubmitScreen;
