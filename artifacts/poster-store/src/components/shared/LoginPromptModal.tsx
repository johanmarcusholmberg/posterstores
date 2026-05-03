import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { useLocation } from "wouter";

interface LoginPromptModalProps {
  open: boolean;
  onClose: () => void;
}

export function LoginPromptModal({ open, onClose }: LoginPromptModalProps) {
  const [, navigate] = useLocation();

  const goToLogin = () => {
    onClose();
    navigate("/login");
  };

  const goToRegister = () => {
    onClose();
    navigate("/register");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm text-center" data-testid="login-prompt-modal">
        <div className="flex justify-center mb-2">
          <Heart className="h-10 w-10 text-secondary fill-secondary/20" />
        </div>
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Save posters you love</DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1">
            Create a free account to keep a personal favorite list across devices.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-4">
          <Button onClick={goToRegister} className="w-full" data-testid="btn-prompt-register">Create account</Button>
          <Button onClick={goToLogin} variant="outline" className="w-full" data-testid="btn-prompt-login">Log in</Button>
          <button
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="btn-prompt-continue"
          >
            Continue browsing
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
