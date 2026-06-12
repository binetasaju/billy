import React, { forwardRef, useMemo } from "react";
import BottomSheet from "@gorhom/bottom-sheet";
import { View, Text, Pressable } from "react-native";

type Props = {
    onCameraPress: () => void;
    onGalleryPress: () => void;
};

const AddBillSheet = forwardRef<BottomSheet, Props>(
    ({ onCameraPress, onGalleryPress }, ref) => {
        const snapPoints = useMemo(() => ["30%"], []);

        return (
            <BottomSheet
                ref={ref}
                index={-1}
                snapPoints={snapPoints}
                enablePanDownToClose
            >
                <View
                    style={{
                        flex: 1,
                        padding: 20,
                    }}
                >
                    <Text
                        style={{
                            fontSize: 18,
                            fontWeight: "600",
                            marginBottom: 20,
                        }}
                    >
                        Add Bill
                    </Text>

                    <Pressable
                        onPress={onCameraPress}
                        style={{
                            paddingVertical: 16,
                        }}
                    >
                        <Text>Take Photo</Text>
                    </Pressable>

                    <Pressable
                        onPress={onGalleryPress}
                        style={{
                            paddingVertical: 16,
                        }}
                    >
                        <Text>Choose From Gallery</Text>
                    </Pressable>
                </View>
            </BottomSheet>
        );
    }
);

export default AddBillSheet;