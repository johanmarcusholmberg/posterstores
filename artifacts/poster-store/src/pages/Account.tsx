import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, User, LogOut } from "lucide-react";

export default function Account() {
  const { user, isLoading, logout } = useAuth();
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 flex justify-center">
        <div className="w-full max-w-md space-y-4 animate-pulse">
          <div className="h-8 bg-muted rounded w-1/2" />
          <div className="h-24 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!user) {
    navigate("/login");
    return null;
  }

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="container mx-auto px-4 py-16 flex justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3 mb-1">
            <User className="h-6 w-6 text-muted-foreground" />
            <CardTitle className="font-serif text-2xl">Your account</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Logged in as</p>
            <p className="font-medium">{user.email}</p>
          </div>

          <div className="border-t border-border pt-6">
            <Link href="/favorites">
              <Button variant="outline" className="w-full justify-start gap-2">
                <Heart className="h-4 w-4" />
                Your saved posters
              </Button>
            </Link>
          </div>

          <div className="border-t border-border pt-4">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
