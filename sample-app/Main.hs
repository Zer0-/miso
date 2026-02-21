{-# LANGUAGE CPP #-}
{-# LANGUAGE OverloadedStrings #-}

import Miso.JSON (decode)

#ifdef WASM
foreign export javascript "hs_start" main :: IO ()
#endif

main :: IO ()
main = do
    let
      rawTestData = Just "true"
      mTestData = decode =<< rawTestData

    case mTestData of
        Nothing -> putStrLn "JSON DECODE ERROR"
        Just True -> putStrLn "True"
        Just False-> putStrLn "False"

