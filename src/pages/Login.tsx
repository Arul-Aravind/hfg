import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import ParticleBackground from "@/components/ParticleBackground";

const Login = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const res = await login(username, password);
      setToken(res.access_token);
      if (res.user.role === "admin") {
        navigate("/boot");
        return;
      }
      navigate("/dashboard");
    } catch (error) {
      toast({
        title: "Login failed",
        description: "Check your credentials and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background grid-bg relative">
      <ParticleBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md glass-card neon-border rounded-xl p-8 deep-shadow">
          <div className="text-center mb-8">
            <p className="font-mono text-xs text-primary uppercase tracking-widest mb-2">EnergySense Admin</p>
            <h1 className="font-orbitron text-3xl font-bold neon-text">Secure Login</h1>
            <p className="text-muted-foreground mt-3 text-sm">
              Access the real-time energy intelligence dashboard.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="bg-muted/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-muted/50"
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Authenticating..." : "Enter Dashboard"}
            </Button>
          </form>

          <div className="mt-6 rounded-lg bg-muted/40 border border-primary/20 p-3 text-xs text-muted-foreground font-mono">
            Demo credentials: <span className="text-primary">admin / admin123</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
