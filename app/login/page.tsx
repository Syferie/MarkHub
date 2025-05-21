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
// import { loginUser } from "../../lib/api-client"; // 不再直接使用
import { useAuth } from "@/context/auth-context"; // 导入 useAuth
import { useState } from "react"; // 用于管理提交状态

const loginSchema = z.object({
  email: z.string().email({ message: "请输入有效的邮箱地址" }),
  password: z.string().min(1, { message: "密码不能为空" }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login } = useAuth(); // 从 AuthContext 获取 login 函数
  const [isSubmitting, setIsSubmitting] = useState(false); // 管理提交状态
  const [error, setError] = useState<string | null>(null); // 管理错误信息

  const form = useForm<LoginFormValues>({
    mode: "uncontrolled",
    initialValues: {
      email: "",
      password: "",
    },
    validate: zodResolver(loginSchema),
  });

  async function handleSubmit(data: LoginFormValues) {
    setIsSubmitting(true);
    setError(null);
    try {
      console.log("尝试登录 (AuthContext):", { identity: data.email, password: data.password });
      await login(data.email, data.password);
      // 登录成功后的导航由 AuthContext 处理
      // console.log("登录成功，将由 AuthContext 导航");
    } catch (err: any) {
      console.error("登录失败 (AuthContext):", err);
      setError(err.message || "登录失败，请检查您的凭据。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Container size={420} my={40}>
      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <Stack align="center" mb="lg">
          <Title ta="center" order={2}>
            欢迎回来
          </Title>
          <Text c="dimmed" size="sm" ta="center">
            输入您的凭据以访问您的帐户。
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
              placeholder="••••••••"
              {...form.getInputProps("password")}
              error={form.errors.password || (error && error.toLowerCase().includes('password') ? error : undefined)}
              radius="md"
            />
            {error && !error.toLowerCase().includes('email') && !error.toLowerCase().includes('password') && (
              <Text c="red" size="sm">
                {error}
              </Text>
            )}
            <Button type="submit" fullWidth mt="xl" radius="md" loading={isSubmitting}>
              {isSubmitting ? "登录中..." : "登录"}
            </Button>
          </Stack>
        </form>

        <Text c="dimmed" size="sm" ta="center" mt="lg">
          还没有帐户？{" "}
          <Anchor component={Link} href="/register" size="sm">
            立即注册
          </Anchor>
        </Text>
      </Paper>
    </Container>
  );
}