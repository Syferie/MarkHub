"use client";

import { useForm, zodResolver } from "@mantine/form";
import {
  TextInput,
  PasswordInput,
  Button,
  Paper,
  Title,
  Text,
  Container,
  Stack,
  Center,
  Anchor,
} from "@mantine/core";
import * as z from "zod";
import Link from "next/link";
// import { registerUser } from "../../lib/api-client"; // 不再直接使用
import { useAuth } from "@/context/auth-context"; // 导入 useAuth
import { useState } from "react"; // 用于管理提交状态和成功消息

const registerSchema = z
  .object({
    email: z.string().email({ message: "请输入有效的邮箱地址" }),
    password: z.string().min(8, { message: "密码至少需要8个字符" }),
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "两次输入的密码不一致",
    path: ["passwordConfirm"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const { register } = useAuth(); // 从 AuthContext 获取 register 函数
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<RegisterFormValues>({
    mode: "uncontrolled",
    initialValues: {
      email: "",
      password: "",
      passwordConfirm: "",
    },
    validate: zodResolver(registerSchema),
  });

  async function handleSubmit(data: RegisterFormValues) {
    setIsSubmitting(true);
    setError(null);
    try {
      console.log("尝试注册 (AuthContext):", { email: data.email, password: data.password, passwordConfirm: data.passwordConfirm });
      await register(data.email, data.password, data.passwordConfirm);
      // 注册成功后会自动登录并跳转到首页，不需要显示成功消息或重置表单
    } catch (err: any) {
      console.error("注册失败 (AuthContext):", err);
      setError(err.message || "注册失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Container size={420} my={40}>
      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <Stack align="center" mb="lg">
          <Title ta="center" order={2}>
            创建您的帐户
          </Title>
          <Text c="dimmed" size="sm" ta="center">
            填写以下信息以注册新帐户。
          </Text>
        </Stack>

        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <TextInput
              required
              label="邮箱"
              placeholder="you@example.com"
              {...form.getInputProps("email")}
              error={form.errors.email || (error && error.toLowerCase().includes('email') ? error : undefined)}
              radius="md"
            />
            <PasswordInput
              required
              label="密码"
              placeholder="•••••••• (至少8位)"
              {...form.getInputProps("password")}
              error={form.errors.password}
              radius="md"
            />
            <PasswordInput
              required
              label="确认密码"
              placeholder="••••••••"
              {...form.getInputProps("passwordConfirm")}
              error={form.errors.passwordConfirm || (error && error.toLowerCase().includes('password') && error.toLowerCase().includes('confirm') ? error : undefined)}
              radius="md"
            />
            {error && !error.toLowerCase().includes('email') && !error.toLowerCase().includes('password') && (
              <Text c="red" size="sm">
                {error}
              </Text>
            )}
            <Button type="submit" fullWidth mt="xl" radius="md" loading={isSubmitting}>
              {isSubmitting ? "注册中..." : "注册并登录"}
            </Button>
          </Stack>
        </form>

        <Text c="dimmed" size="sm" ta="center" mt="lg">
          已经有帐户了？{" "}
          <Anchor component={Link} href="/login" size="sm">
            立即登录
          </Anchor>
        </Text>
      </Paper>
    </Container>
  );
}