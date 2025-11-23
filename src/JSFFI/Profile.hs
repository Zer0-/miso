{-# LANGUAGE CPP #-}

module JSFFI.Profile where

#if defined(wasm32_HOST_ARCH)
import GHC.Wasm.Prim (JSString(..), toJSString)
import Control.Monad.IO.Class (MonadIO, liftIO)

foreign import javascript unsafe "window.sectionStart($1)"
    sectionStart :: JSString -> IO ()

foreign import javascript unsafe "window.sectionEnd($1)"
    sectionEnd :: JSString -> IO ()

foreign import javascript unsafe "window.displayTotals()"
    displayTotals :: IO ()

bracket2 :: (MonadIO m) => String -> m a -> m a
bracket2 tag action = do
    liftIO $ sectionStart (toJSString tag)
    result <- action
    liftIO $ sectionEnd (toJSString tag)
    return result

bracket :: b -> m a -> m a
bracket _ action = action
#else
sectionStart :: a -> IO ()
sectionStart _ = return ()

sectionEnd :: a -> IO ()
sectionEnd = sectionStart

displayTotals :: IO ()
displayTotals = return ()

bracket :: b -> m a -> m a
bracket _ action = action

toJSString :: a -> a
toJSString = id
#endif
