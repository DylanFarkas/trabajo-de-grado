import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth";
import { MyContributions } from "@/components/MyContributions";
import { useMapPanel } from "@/map-panel";

type AuthMode = "login" | "register";

function Avatar({ uri, size }: { uri: string | null; size: number }) {
  if (uri) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        contentFit="cover"
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        transition={150}
      />
    );
  }

  return (
    <View
      className="items-center justify-center rounded-full bg-[#f2f2f4]"
      style={{ width: size, height: size }}
    >
      <MaterialIcons name="person" size={Math.round(size * 0.45)} color="#8e8e93" />
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  secure,
  autoComplete,
  textContentType,
  editable = true,
  returnKeyType,
  onSubmitEditing,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  keyboardType?: "email-address" | "default";
  secure?: boolean;
  autoComplete?: "email" | "password" | "name" | "off";
  textContentType?: "emailAddress" | "password" | "name" | "none";
  editable?: boolean;
  returnKeyType?: "next" | "go" | "done";
  onSubmitEditing?: () => void;
  inputRef?: React.Ref<TextInput>;
}) {
  const [hidden, setHidden] = useState(Boolean(secure));

  return (
    <View className="mb-3">
      <Text className="mb-1.5 text-[13px] font-semibold text-[#8e8e93]">{label}</Text>
      <View className="h-12 flex-row items-center rounded-2xl bg-[#f5f5f7] px-3.5">
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#8e8e93"
          className="min-w-0 flex-1 font-sans text-[16px] text-[#111111]"
          style={{ margin: 0, includeFontPadding: false }}
          keyboardType={keyboardType ?? "default"}
          autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
          autoCorrect={false}
          secureTextEntry={hidden}
          autoComplete={autoComplete}
          textContentType={textContentType}
          editable={editable}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={!onSubmitEditing}
          underlineColorAndroid="transparent"
          accessibilityLabel={label}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Mostrar contraseña" : "Ocultar contraseña"}
            onPress={() => setHidden((prev) => !prev)}
            hitSlop={8}
            className="ml-2 active:opacity-70"
          >
            <MaterialIcons name={hidden ? "visibility" : "visibility-off"} size={20} color="#8e8e93" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <View className="mb-3 flex-row items-start rounded-2xl border border-[rgba(180,40,40,0.18)] bg-[#fff5f5] px-3.5 py-3">
      <MaterialIcons name="info-outline" size={18} color="#8a1f1f" />
      <Text className="ml-2 flex-1 text-sm font-semibold leading-5 text-[#8a1f1f]">{message}</Text>
    </View>
  );
}

export function ProfileScreen() {
  const { profile, loading, busy, error, signIn, signUp, signOut } = useAuth();
  const { setProfileOpen } = useMapPanel();
  const [mode, setMode] = useState<AuthMode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const submitDisabled = busy || email.trim().length === 0 || password.length < 6;

  const submit = () => {
    if (submitDisabled) return;
    Keyboard.dismiss();
    if (mode === "register") {
      void signUp(email, password, fullName);
      return;
    }
    void signIn(email, password);
  };

  const subtitle = profile
    ? (profile.fullName ?? profile.email ?? "Tu cuenta")
    : mode === "register"
      ? "Crea tu cuenta"
      : "Entra con tu correo";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#ffffff" }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8, flexGrow: 1 }}
      >
        <View className="mb-6 flex-row items-start">
          <View className="min-w-0 flex-1 pr-3">
            <Text className="text-[28px] font-extrabold tracking-tight text-[#111111]">Perfil</Text>
            <Text className="mt-1 font-sans text-[15px] text-[#8e8e93]">{subtitle}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar perfil"
            onPress={() => {
              Keyboard.dismiss();
              setProfileOpen(false);
            }}
            hitSlop={8}
            className="size-8 items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80"
          >
            <MaterialIcons name="close" size={18} color="#3a3a3c" />
          </Pressable>
        </View>

        {loading ? (
          <View className="items-center py-16">
            <ActivityIndicator size="small" color="#111111" />
            <Text className="mt-2 font-sans text-sm text-[#8e8e93]">Cargando perfil…</Text>
          </View>
        ) : profile ? (
          <View>
            <View className="items-center pb-2">
              <Avatar uri={profile.avatarUrl} size={88} />
              <Text className="mt-4 text-center text-[18px] font-bold text-[#111111]">
                {profile.fullName ?? "Tu cuenta"}
              </Text>
              {profile.email ? (
                <Text className="mt-1 text-center font-sans text-[13px] text-[#8e8e93]">{profile.email}</Text>
              ) : null}
              {profile.role === "admin" ? (
                <View className="mt-3 rounded-full bg-[#f2f2f4] px-3 py-1">
                  <Text className="text-[11px] font-bold uppercase tracking-wide text-[#3a3a3c]">
                    Administrador
                  </Text>
                </View>
              ) : null}
            </View>

            {error ? <ErrorBox message={error} /> : null}

            <MyContributions userId={profile.id} />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar sesión"
              onPress={() => {
                void signOut();
              }}
              className="mt-6 h-12 flex-row items-center justify-center rounded-2xl bg-[#f2f2f4] active:opacity-80"
            >
              <MaterialIcons name="logout" size={18} color="#111111" />
              <Text className="ml-2 text-[15px] font-bold text-[#111111]">Cerrar sesión</Text>
            </Pressable>
          </View>
        ) : (
          <View>
            <View className="mb-5 flex-row rounded-2xl bg-[#f5f5f7] p-1">
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === "login" }}
                onPress={() => setMode("login")}
                className={`h-10 flex-1 items-center justify-center rounded-xl ${
                  mode === "login" ? "bg-white" : ""
                }`}
              >
                <Text className={`text-[14px] font-bold ${mode === "login" ? "text-[#111111]" : "text-[#8e8e93]"}`}>
                  Entrar
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === "register" }}
                onPress={() => setMode("register")}
                className={`h-10 flex-1 items-center justify-center rounded-xl ${
                  mode === "register" ? "bg-white" : ""
                }`}
              >
                <Text
                  className={`text-[14px] font-bold ${mode === "register" ? "text-[#111111]" : "text-[#8e8e93]"}`}
                >
                  Crear cuenta
                </Text>
              </Pressable>
            </View>

            <Text className="mb-5 font-sans text-[13px] leading-5 text-[#8e8e93]">
              El mapa se puede usar sin cuenta. Con una cuenta puedes aportar información de los espacios y seguir su revisión.
            </Text>

            {error ? <ErrorBox message={error} /> : null}

            {mode === "register" ? (
              <Field
                label="Nombre"
                value={fullName}
                onChange={setFullName}
                placeholder="Opcional"
                autoComplete="name"
                textContentType="name"
                editable={!busy}
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
              />
            ) : null}
            <Field
              label="Correo"
              value={email}
              onChange={setEmail}
              placeholder="ivan.p@example.net"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              editable={!busy}
              inputRef={emailRef}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <Field
              label="Contraseña"
              value={password}
              onChange={setPassword}
              placeholder="Mínimo 6 caracteres"
              secure
              autoComplete="password"
              textContentType="password"
              editable={!busy}
              inputRef={passwordRef}
              returnKeyType="go"
              onSubmitEditing={submit}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={mode === "register" ? "Crear cuenta" : "Entrar"}
              disabled={submitDisabled}
              onPress={submit}
              className={`mt-2 h-12 flex-row items-center justify-center rounded-2xl bg-[#111111] active:opacity-80 ${
                submitDisabled ? "opacity-40" : ""
              }`}
            >
              {busy ? <ActivityIndicator size="small" color="#ffffff" /> : null}
              <Text className={`text-[15px] font-bold text-white ${busy ? "ml-2" : ""}`}>
                {busy ? "Enviando…" : mode === "register" ? "Crear cuenta" : "Entrar"}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
