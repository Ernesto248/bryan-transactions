"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Search,
  SlidersHorizontal,
  ChevronDown,
  CalendarIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export type DateFilter =
  | "all"
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "custom";

interface FilterBarProps {
  bankFilter: string;
  setBankFilter: (value: string) => void;
  bankOptions: string[];
  accountFilter: string;
  setAccountFilter: (value: string) => void;
  accountOptions: string[];
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  senderFilter: string;
  setSenderFilter: (value: string) => void;
  amountFilter: string;
  setAmountFilter: (value: string) => void;
  remeseroFilter: string;
  setRemeseroFilter: (value: string) => void;
  remeseroOptions: string[];
  dateFilter: DateFilter;
  setDateFilter: (value: DateFilter) => void;
  customDateRange: { from: Date | undefined; to: Date | undefined };
  setCustomDateRange: (value: {
    from: Date | undefined;
    to: Date | undefined;
  }) => void;
}

const dateFilterOptions = [
  { value: "all", label: "Todas las fechas" },
  { value: "today", label: "Hoy" },
  { value: "yesterday", label: "Ayer" },
  { value: "week", label: "Última semana" },
  { value: "month", label: "Último mes" },
  { value: "custom", label: "Personalizado" },
];

export function FilterBar({
  bankFilter,
  setBankFilter,
  bankOptions,
  accountFilter,
  setAccountFilter,
  accountOptions,
  searchQuery,
  setSearchQuery,
  senderFilter,
  setSenderFilter,
  amountFilter,
  setAmountFilter,
  remeseroFilter,
  setRemeseroFilter,
  remeseroOptions,
  dateFilter,
  setDateFilter,
  customDateRange,
  setCustomDateRange,
}: FilterBarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasActiveFilters =
    bankFilter !== "all" ||
    accountFilter !== "all" ||
    senderFilter.trim() !== "" ||
    remeseroFilter !== "all" ||
    amountFilter.trim() !== "" ||
    dateFilter !== "all";

  const activeFiltersCount = [
    bankFilter !== "all",
    accountFilter !== "all",
    senderFilter.trim() !== "",
    remeseroFilter !== "all",
    amountFilter.trim() !== "",
    dateFilter !== "all",
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setBankFilter("all");
    setAccountFilter("all");
    setSenderFilter("");
    setRemeseroFilter("all");
    setAmountFilter("");
    setSearchQuery("");
    setDateFilter("all");
    setCustomDateRange({ from: undefined, to: undefined });
  };

  const formatDateRange = () => {
    if (!customDateRange.from && !customDateRange.to)
      return "Seleccionar fechas";
    if (customDateRange.from && customDateRange.to) {
      return `${format(customDateRange.from, "dd MMM", { locale: es })} - ${format(customDateRange.to, "dd MMM", { locale: es })}`;
    }
    if (customDateRange.from) {
      return `Desde ${format(customDateRange.from, "dd MMM", { locale: es })}`;
    }
    return "Seleccionar fechas";
  };

  return (
    <div className="space-y-3">
      {/* Search bar - always visible */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por sender..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Limpiar búsqueda"
              title="Limpiar búsqueda"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible filters */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between bg-secondary border-border text-foreground hover:bg-secondary/80"
          >
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              <span>Filtros</span>
              {activeFiltersCount > 0 && (
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                  {activeFiltersCount}
                </span>
              )}
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                isOpen && "rotate-180",
              )}
            />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-3">
          <div className="space-y-3 rounded-lg border border-border bg-card/50 p-4">
            {/* Date filter buttons */}
            <div className="space-y-2">
              <span className="text-sm font-medium text-muted-foreground">
                Fecha
              </span>
              <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2">
                {dateFilterOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={
                      dateFilter === option.value ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => {
                      setDateFilter(option.value as DateFilter);
                      if (option.value !== "custom") {
                        setCustomDateRange({ from: undefined, to: undefined });
                      }
                    }}
                    className={cn(
                      "text-xs h-9 px-2 sm:px-3",
                      dateFilter === option.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>

              {/* Custom date range picker */}
              {dateFilter === "custom" && (
                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal bg-secondary border-border",
                          !customDateRange.from && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customDateRange.from ? (
                          format(customDateRange.from, "dd MMM yyyy", {
                            locale: es,
                          })
                        ) : (
                          <span>Fecha inicio</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0 bg-card border-border"
                      align="start"
                    >
                      <Calendar
                        mode="single"
                        selected={customDateRange.from}
                        onSelect={(date) =>
                          setCustomDateRange({ ...customDateRange, from: date })
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal bg-secondary border-border",
                          !customDateRange.to && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customDateRange.to ? (
                          format(customDateRange.to, "dd MMM yyyy", {
                            locale: es,
                          })
                        ) : (
                          <span>Fecha fin</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0 bg-card border-border"
                      align="start"
                    >
                      <Calendar
                        mode="single"
                        selected={customDateRange.to}
                        onSelect={(date) =>
                          setCustomDateRange({ ...customDateRange, to: date })
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>

            {/* Bank and Email filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Banco
                </span>
                <Select value={bankFilter} onValueChange={setBankFilter}>
                  <SelectTrigger className="w-full bg-secondary border-border text-foreground">
                    <SelectValue placeholder="Banco" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="all">Todos los bancos</SelectItem>
                    {bankOptions.map((bank) => (
                      <SelectItem key={bank} value={bank}>
                        {bank}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Cuenta
                </span>
                <Select value={accountFilter} onValueChange={setAccountFilter}>
                  <SelectTrigger className="w-full bg-secondary border-border text-foreground">
                    <SelectValue placeholder="Cuenta" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="all">Todas las cuentas</SelectItem>
                    {accountOptions.map((account) => (
                      <SelectItem key={account} value={account}>
                        {account}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Sender, amount and remesero filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Sender
                </span>
                <Input
                  value={senderFilter}
                  onChange={(e) => setSenderFilter(e.target.value)}
                  placeholder="Nombre del sender"
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Monto
                </span>
                <Input
                  type="number"
                  min="0"
                  value={amountFilter}
                  onChange={(e) => setAmountFilter(e.target.value)}
                  placeholder="Monto exacto"
                  className="bg-secondary border-border text-foreground"
                />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Remesero
                </span>
                <Select
                  value={remeseroFilter}
                  onValueChange={setRemeseroFilter}
                >
                  <SelectTrigger className="w-full bg-secondary border-border text-foreground">
                    <SelectValue placeholder="Remesero" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="unassigned">Sin remesero</SelectItem>
                    {remeseroOptions.map((remesero) => (
                      <SelectItem key={remesero} value={remesero}>
                        {remesero}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Clear filters button */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="w-full text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4 mr-2" />
                Limpiar todos los filtros
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
