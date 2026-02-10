import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface CartState {
  count: number;
  addItem: () => void;
  removeItem: () => void;
  setCount: (n: number) => void;
}

const CartContext = createContext<CartState>({
  count: 0,
  addItem: () => {},
  removeItem: () => {},
  setCount: () => {},
});

export function CartProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const addItem = useCallback(() => setCount((c) => c + 1), []);
  const removeItem = useCallback(
    () => setCount((c) => Math.max(0, c - 1)),
    [],
  );

  return (
    <CartContext.Provider value={{ count, addItem, removeItem, setCount }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartState {
  return useContext(CartContext);
}
