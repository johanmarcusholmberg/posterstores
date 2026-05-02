import React, { useState } from "react";
import { useAdminToken } from "@/context/AdminTokenContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Lock } from "lucide-react";

export const AdminTokenGate = ({ children }: { children: React.ReactNode }) => {
  const { token, setToken } = useAdminToken();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  if (token) return <>{children}</>;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) {
      setError("Please enter your admin token.");
      return;
    }
    setToken(trimmed);
    setError("");
  };

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Admin Access</CardTitle>
          <CardDescription>
            Enter your admin token to access the poster management area.
            The token is stored locally in your browser and never sent to any server except
            for authenticating admin API calls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-token">Admin Token</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="admin-token"
                  type="password"
                  placeholder="Enter token..."
                  className="pl-10"
                  value={input}
                  onChange={e => { setInput(e.target.value); setError(""); }}
                  autoFocus
                  data-testid="admin-token-input"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <Button type="submit" className="w-full" data-testid="admin-token-submit">
              Enter Admin Area
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
