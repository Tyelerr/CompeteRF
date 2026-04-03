import { Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { MAX_USER_TEMPLATES, UserTemplate } from "../../../models/services/tournament-template.service";
import { COLORS } from "../../../theme/colors";
import { moderateScale, scale } from "../../../utils/scaling";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

interface Props { templates: UserTemplate[]; templateCount: number; onApply: (t: UserTemplate) => void; onDelete: (id: number) => void; }

export const TemplateStrip = ({ templates, templateCount, onApply, onDelete }: Props) => {
  return (
    <View style={{ paddingHorizontal: isWeb ? 20 : wxSc(16), paddingTop: wxSc(12), paddingBottom: wxSc(10), borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: wxSc(8) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: wxSc(8) }}>
          <Text allowFontScaling={false} style={{ fontSize: wxMs(isWeb ? 11 : 12), fontWeight: "700", color: COLORS.text, textTransform: "uppercase", letterSpacing: 0.5 }}>My Templates</Text>
          <View style={{ backgroundColor: templateCount >= MAX_USER_TEMPLATES ? COLORS.error + "30" : COLORS.primary + "20", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text allowFontScaling={false} style={{ fontSize: wxMs(10), fontWeight: "700", color: templateCount >= MAX_USER_TEMPLATES ? COLORS.error : COLORS.primary }}>{templateCount} / {MAX_USER_TEMPLATES}</Text>
          </View>
        </View>
      </View>
      {templateCount === 0 ? (
        <Text allowFontScaling={false} style={{ fontSize: wxMs(11), color: COLORS.textMuted, fontStyle: "italic", paddingVertical: 4 }}>No templates yet. Fill out the form and tap Save as Template to create one.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: wxSc(8), paddingRight: 4 }}>
          {templates.map((t) => <TemplateCard key={t.id} template={t} onApply={onApply} onDelete={onDelete} />)}
        </ScrollView>
      )}
    </View>
  );
};

const TemplateCard = ({ template, onApply, onDelete }: { template: UserTemplate; onApply: (t: UserTemplate) => void; onDelete: (id: number) => void }) => {
  const gameLabel = template.game_type ? template.game_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null;
  return (
    <TouchableOpacity onPress={() => onApply(template)} style={{ backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: wxSc(8), padding: wxSc(10), minWidth: isWeb ? 140 : wxSc(130), maxWidth: isWeb ? 180 : wxSc(160), position: "relative" }} activeOpacity={0.75}>
      <TouchableOpacity onPress={() => onDelete(template.id)} hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }} style={{ position: "absolute", top: 5, right: 6, width: wxSc(16), height: wxSc(16), borderRadius: wxSc(8), backgroundColor: COLORS.border, alignItems: "center", justifyContent: "center", zIndex: 2 }}>
        <Text allowFontScaling={false} style={{ fontSize: wxMs(9), color: COLORS.textMuted, fontWeight: "700", lineHeight: 16 }}>✕</Text>
      </TouchableOpacity>
      <Text allowFontScaling={false} style={{ fontSize: wxMs(12), fontWeight: "700", color: COLORS.text, marginRight: 18, marginBottom: 3 }} numberOfLines={1}>{template.name}</Text>
      {gameLabel && <Text allowFontScaling={false} style={{ fontSize: wxMs(10), color: COLORS.primary, fontWeight: "600", marginBottom: 2 }} numberOfLines={1}>{gameLabel}</Text>}
      {template.tournament_format && <Text allowFontScaling={false} style={{ fontSize: wxMs(10), color: COLORS.textSecondary }} numberOfLines={1}>{template.tournament_format}</Text>}
      {(template.entry_fee ?? 0) > 0 && <Text allowFontScaling={false} style={{ fontSize: wxMs(10), color: COLORS.textMuted, marginTop: 3 }}>{`$${Number(template.entry_fee).toFixed(2)} entry`}</Text>}
      <View style={{ marginTop: wxSc(6), paddingTop: 5, borderTopWidth: 1, borderTopColor: COLORS.border, flexDirection: "row", alignItems: "center", gap: 3 }}>
        <Text allowFontScaling={false} style={{ fontSize: wxMs(9), color: COLORS.primary, fontWeight: "600" }}>TAP TO LOAD</Text>
      </View>
    </TouchableOpacity>
  );
};
